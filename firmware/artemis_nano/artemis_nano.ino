/*
 * A.R.T.E.M.I.S. — Arduino Nano sensor unit
 *
 * Reads the MPU6050 (I2C), HC-SR04 ultrasonic sensor and IR sensor, streams
 * them to the PC dashboard, and drives the buzzer from the status the PC
 * decides (camera AI + sensors). If the PC goes quiet the Nano falls back to
 * local obstacle / vibration alarms so the buzzer still works on its own.
 *
 * Wiring (change the pins below to match your board):
 *   MPU6050  SDA -> A4, SCL -> A5, VCC -> 5V, GND -> GND
 *   HC-SR04  TRIG -> D9, ECHO -> D10
 *   IR       OUT -> D7   (most modules pull LOW when triggered)
 *   Buzzer   + -> D6    (passive buzzer, driven with tone())
 *
 * Serial 115200 baud.
 *   Nano -> PC : S,<dist_cm>,<ir>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>\n   (~20 Hz)
 *   PC -> Nano : G / Y / R  status SAFE / WARNING / DANGER
 *                B / b      buzzer enabled / muted
 */

#include <Wire.h>

const uint8_t PIN_TRIG = 9;
const uint8_t PIN_ECHO = 10;
const uint8_t PIN_IR = 7;
const uint8_t PIN_BUZZER = 6;
const bool IR_ACTIVE_LOW = true;

const uint8_t MPU_ADDR = 0x68;
const float ACC_LSB_PER_G = 16384.0;    // +-2 g range
const float GYRO_LSB_PER_DPS = 131.0;   // +-250 deg/s range

const unsigned long SAMPLE_MS = 50;      // 20 Hz telemetry
const unsigned long PC_TIMEOUT_MS = 1500;

// Stand-alone fallback thresholds, used only while the PC is not talking to us
const float LOCAL_OBSTACLE_CM = 60.0;
const float LOCAL_SHOCK_G = 0.6;         // | |acc| - 1 g | spike

char status = 'G';
bool buzzerEnabled = true;
unsigned long lastPcMsg = 0;
unsigned long lastSample = 0;

void mpuWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

bool readMpu(float acc[3], float gyro[3]) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, (uint8_t)14) != 14) return false;
  int16_t raw[7];
  for (uint8_t i = 0; i < 7; i++) raw[i] = (Wire.read() << 8) | Wire.read();
  for (uint8_t i = 0; i < 3; i++) {
    acc[i] = raw[i] / ACC_LSB_PER_G;
    gyro[i] = raw[i + 4] / GYRO_LSB_PER_DPS;  // raw[3] is temperature
  }
  return true;
}

float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long us = pulseIn(PIN_ECHO, HIGH, 25000UL);  // ~4 m max, keeps the loop fast
  if (us == 0) return -1;                                // no echo
  return us / 58.0;
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 'G': case 'Y': case 'R': status = c; lastPcMsg = millis(); break;
      case 'B': buzzerEnabled = true; lastPcMsg = millis(); break;
      case 'b': buzzerEnabled = false; lastPcMsg = millis(); break;
    }
  }
}

// DANGER: continuous tone. WARNING: 200 ms beep every second. SAFE: silent.
void driveBuzzer(char s) {
  if (!buzzerEnabled || s == 'G') {
    noTone(PIN_BUZZER);
    return;
  }
  if (s == 'R') {
    tone(PIN_BUZZER, 2200);
  } else if ((millis() % 1000) < 200) {
    tone(PIN_BUZZER, 1600);
  } else {
    noTone(PIN_BUZZER);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_IR, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  Wire.begin();
  mpuWrite(0x6B, 0x00);  // wake up
  mpuWrite(0x1C, 0x00);  // accel +-2 g
  mpuWrite(0x1B, 0x00);  // gyro +-250 deg/s
  mpuWrite(0x1A, 0x03);  // 44 Hz low-pass
}

void loop() {
  handleSerial();

  float acc[3] = {0, 0, 1};
  float gyro[3] = {0, 0, 0};
  static float distance = -1;
  static bool ir = false;

  if (millis() - lastSample >= SAMPLE_MS) {
    lastSample = millis();
    readMpu(acc, gyro);
    distance = readDistanceCm();
    ir = digitalRead(PIN_IR) == (IR_ACTIVE_LOW ? LOW : HIGH);

    Serial.print("S,");
    Serial.print(distance, 1); Serial.print(',');
    Serial.print(ir ? 1 : 0); Serial.print(',');
    for (uint8_t i = 0; i < 3; i++) { Serial.print(acc[i], 3); Serial.print(','); }
    for (uint8_t i = 0; i < 3; i++) { Serial.print(gyro[i], 2); Serial.print(i < 2 ? ',' : '\n'); }

    if (millis() - lastPcMsg > PC_TIMEOUT_MS) {
      // PC offline: local safety net from the sensors alone
      float mag = sqrt(acc[0] * acc[0] + acc[1] * acc[1] + acc[2] * acc[2]);
      bool obstacle = distance > 0 && distance <= LOCAL_OBSTACLE_CM;
      bool shock = fabs(mag - 1.0) >= LOCAL_SHOCK_G;
      status = obstacle ? 'R' : (shock || ir) ? 'Y' : 'G';
    }
  }

  driveBuzzer(status);
}

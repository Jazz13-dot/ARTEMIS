import java.io.*;

// Good Substrings: for each i, count substrings containing i that are not
// "bad" (contain 2025 as a subsequence but not 2026).
//
// Fix l. Greedily match "202" from l, ending at p3. The shortest prefix
// s[l..r] containing 2025 ends at A = next '5' after p3, and the shortest
// containing 2026 ends at B = next '6' after p3 (n+1 if absent). So s[l..r]
// is bad exactly for r in [A, B-1].
// That l adds to bad(i):
//   * (B - A)  for i in [l, A-1]   (every bad r is >= i)
//   * (B - i)  for i in [A, B-1]
// Both are range updates of a + b*i, applied with two difference arrays.
// Answer(i) = i*(n-i+1) - bad(i). O(n) per test.
public class Main {
    public static void main(String[] args) throws IOException {
        DataInputStream in = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));
        int t = nextInt(in);
        ByteArrayOutputStream bos = new ByteArrayOutputStream(1 << 16);
        StringBuilder sb = new StringBuilder();
        while (t-- > 0) {
            int n = nextInt(in);
            byte[] s = new byte[n + 2];
            int b = in.read();
            while (b < '0' || b > '9') b = in.read();
            for (int i = 1; i <= n; i++) {
                s[i] = (byte) b;
                b = in.read();
            }

            // nxt[c][p] = smallest q >= p with s[q] == c, or n+1.
            int[][] nxt = new int[4][n + 2];
            char[] cs = {'2', '0', '5', '6'};
            for (int c = 0; c < 4; c++) {
                nxt[c][n + 1] = n + 1;
                for (int p = n; p >= 1; p--) nxt[c][p] = s[p] == cs[c] ? p : nxt[c][p + 1];
            }

            long[] constDiff = new long[n + 2], linDiff = new long[n + 2];
            for (int l = 1; l <= n; l++) {
                int p = nxt[0][l];
                if (p > n) break;
                p = nxt[1][p + 1 > n ? n + 1 : p + 1];
                if (p > n) break;
                p = nxt[0][p + 1 > n ? n + 1 : p + 1];
                if (p > n) break;
                int q = p + 1 > n ? n + 1 : p + 1;
                int A = nxt[2][q], B = nxt[3][q];
                if (A > n || A > B) continue;
                // i in [l, A-1]: add (B - A)
                constDiff[l] += B - A;
                constDiff[A] -= B - A;
                // i in [A, B-1]: add B - i
                constDiff[A] += B;
                constDiff[B] -= B;
                linDiff[A] -= 1;
                linDiff[B] += 1;
            }

            long c = 0, k = 0;
            for (int i = 1; i <= n; i++) {
                c += constDiff[i];
                k += linDiff[i];
                long bad = c + k * i;
                sb.append((long) i * (n - i + 1) - bad).append(' ');
            }
            sb.append('\n');
            if (sb.length() > 1 << 16) {
                bos.write(sb.toString().getBytes());
                sb.setLength(0);
            }
        }
        bos.write(sb.toString().getBytes());
        System.out.write(bos.toByteArray());
        System.out.flush();
    }

    private static int nextInt(DataInputStream in) throws IOException {
        int ret = 0, b = in.read();
        while (b < '0') b = in.read();
        while (b >= '0') {
            ret = ret * 10 + (b - '0');
            b = in.read();
        }
        return ret;
    }
}

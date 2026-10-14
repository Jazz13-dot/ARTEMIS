import java.io.*;
import java.util.*;

// Perfect Sandwiches: answer is min(b, a - b), or -1 if that is below 1.
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        StringBuilder sb = new StringBuilder();
        while (t-- > 0) {
            StringTokenizer st = new StringTokenizer(br.readLine());
            int a = Integer.parseInt(st.nextToken());
            int b = Integer.parseInt(st.nextToken());
            int k = Math.min(b, a - b);
            sb.append(k >= 1 ? k : -1).append('\n');
        }
        System.out.print(sb);
    }
}

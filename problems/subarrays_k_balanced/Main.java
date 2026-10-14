import java.io.*;
import java.util.*;

// Subarrays: count subarrays with sum divisible by k and length > k.
//
// With prefix sums p[0..n], subarray (j+1..r) qualifies iff p[j] = p[r] (mod k)
// and r - j > k, i.e. j <= r - k - 1. Sweep r and add p[r-k-1] mod k to a
// count table just before it becomes eligible. Since k < n, the table has
// size k <= n. O(n) per test.
public class Main {
    public static void main(String[] args) throws IOException {
        DataInputStream in = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));
        int t = nextInt(in);
        StringBuilder sb = new StringBuilder();
        while (t-- > 0) {
            int n = nextInt(in), k = nextInt(in);
            int[] pre = new int[n + 1];
            for (int i = 1; i <= n; i++) pre[i] = (int) ((pre[i - 1] + (long) nextInt(in)) % k);
            int[] cnt = new int[k];
            long ans = 0;
            for (int r = k + 1; r <= n; r++) {
                cnt[pre[r - k - 1]]++;
                ans += cnt[pre[r]];
            }
            sb.append(ans).append('\n');
        }
        System.out.print(sb);
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

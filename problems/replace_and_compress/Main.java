import java.io.*;

// Replace and Compress: count distinct compressed strings after flipping at
// most one inner character.
//
// A compressed string alternates and starts with s[0], which never changes,
// so it is determined by its length (the number of blocks). Flipping s[i]
// toggles the two boundaries (i-1, i) and (i, i+1). If c of them were
// boundaries before, the block count changes by (2 - c) - c = 2 - 2c, i.e.
// +2, 0 or -2. So the answer is the number of distinct values among L (no
// flip) and L + 2 - 2c over all inner positions: at most 3.
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int t = Integer.parseInt(br.readLine().trim());
        StringBuilder sb = new StringBuilder();
        while (t-- > 0) {
            String s = br.readLine().trim();
            int n = s.length();
            boolean plus = false, minus = false;
            for (int i = 1; i + 1 < n; i++) {
                int c = (s.charAt(i - 1) != s.charAt(i) ? 1 : 0)
                      + (s.charAt(i) != s.charAt(i + 1) ? 1 : 0);
                if (c == 0) plus = true;
                if (c == 2) minus = true;
            }
            sb.append(1 + (plus ? 1 : 0) + (minus ? 1 : 0)).append('\n');
        }
        System.out.print(sb);
    }
}

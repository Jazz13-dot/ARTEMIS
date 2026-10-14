import java.io.*;

// Caveman: count red/blue colorings where every vertex has a neighbour of the
// opposite colour, reporting 0 / 1 / 2 / many.
//
// * An isolated vertex can never be satisfied: Brain Melt.
// * Otherwise every component has >= 2 vertices. Pick a spanning forest and a
//   minimum edge cover of it; its components are stars. Colouring each star's
//   centre opposite to its leaves is valid, and each star can be flipped
//   independently. So with >= 2 stars there are >= 4 valid colourings.
// * Only one star is possible iff some vertex is adjacent to all others. If
//   the graph is exactly that star, leaves are forced opposite to the centre:
//   exactly 2 colourings. If there is any extra edge a-b between leaves,
//   recolouring a to match the centre is also valid: Many.
// The count is never 1 (swapping all colours gives a second colouring).
public class Main {
    public static void main(String[] args) throws IOException {
        DataInputStream in = new DataInputStream(new BufferedInputStream(System.in, 1 << 16));
        int t = nextInt(in);
        StringBuilder sb = new StringBuilder();
        while (t-- > 0) {
            int n = nextInt(in), m = nextInt(in);
            int[] deg = new int[n + 1];
            for (int i = 0; i < m; i++) {
                deg[nextInt(in)]++;
                deg[nextInt(in)]++;
            }
            boolean isolated = false, universal = false;
            for (int v = 1; v <= n; v++) {
                if (deg[v] == 0) isolated = true;
                if (deg[v] == n - 1) universal = true;
            }
            if (isolated) sb.append("Brain Melt");
            else if (universal && m == n - 1) sb.append(2);
            else sb.append("Many");
            sb.append('\n');
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

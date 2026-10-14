// Reversal Maximize: maximize fixed points of a permutation after at most one
// subarray reversal.
//
// Reversing [L, R] moves the value at index j to index L + R - j, so j becomes
// a fixed point iff j + P[j] == L + R. For a fixed sum s = L + R, index j is
// covered by the (symmetric) segment iff L <= min(j, P[j]). Sorting the
// candidates of each sum by min(j, P[j]) descending, picking L = the k-th
// value covers exactly the first k candidates; the cost is the number of
// original fixed points inside [L, s - L], read off a prefix sum.
// Total work is O(N log N).
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    cin >> T;
    while (T--) {
        int n;
        cin >> n;
        vector<int> p(n + 1), pre(n + 1, 0);
        for (int i = 1; i <= n; i++) {
            cin >> p[i];
            pre[i] = pre[i - 1] + (p[i] == i);
        }
        vector<vector<int>> bySum(2 * n + 1);
        for (int j = 1; j <= n; j++) bySum[j + p[j]].push_back(min(j, p[j]));

        int best = 0;
        for (int s = 2; s <= 2 * n; s++) {
            auto &v = bySum[s];
            if (v.empty()) continue;
            sort(v.rbegin(), v.rend());
            for (size_t k = 0; k < v.size(); k++) {
                // Take all candidates sharing this L before evaluating.
                if (k + 1 < v.size() && v[k + 1] == v[k]) continue;
                int L = v[k], R = s - L;
                best = max(best, (int)(k + 1) - (pre[R] - pre[L - 1]));
            }
        }
        cout << pre[n] + best << '\n';
    }
    return 0;
}

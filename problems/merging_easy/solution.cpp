// Merging (Easy): for each i, count pairs (A, B) with merge(A, B) = P and
// |A| = i.
//
// Split P into blocks, each starting at a prefix maximum and running up to the
// next one. Every element of a block is smaller than its leader, so the merge
// never switches arrays in the middle of a block: each block goes wholly to A
// or wholly to B. Conversely, any assignment of whole blocks reproduces P,
// since leaders increase. The answer is therefore a subset-sum count over
// block sizes, computed with an O(N^2) knapsack.
#include <bits/stdc++.h>
using namespace std;

const int MOD = 998244353;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    cin >> T;
    while (T--) {
        int n;
        cin >> n;
        vector<int> p(n);
        for (auto &x : p) cin >> x;

        vector<int> sizes;
        int mx = 0;
        for (int i = 0; i < n; i++) {
            if (p[i] > mx) {
                mx = p[i];
                sizes.push_back(0);
            }
            sizes.back()++;
        }

        vector<int> dp(n + 1, 0);
        dp[0] = 1;
        int total = 0;
        for (int sz : sizes) {
            total += sz;
            for (int i = total; i >= sz; i--) dp[i] = (dp[i] + dp[i - sz]) % MOD;
        }

        for (int i = 0; i <= n; i++) cout << dp[i] << " \n"[i == n];
    }
    return 0;
}

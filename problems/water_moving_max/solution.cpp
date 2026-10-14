// Water Moving (Max): after exactly K moves, maximize the largest cup.
//
// Each move adds at most one cup's water to another, so after K moves a cup
// can hold at most K + 1 original cups' worth. Pouring the largest K + 1 cups
// (or all N if fewer) into one cup achieves this, and any leftover moves can
// be wasted by pouring an already empty cup somewhere. So:
//   answer = sum of the largest min(K + 1, N) values of A.
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    cin >> T;
    while (T--) {
        int n, k;
        cin >> n >> k;
        vector<int> a(n);
        for (auto &x : a) cin >> x;
        sort(a.rbegin(), a.rend());
        int take = min(k + 1, n), sum = 0;
        for (int i = 0; i < take; i++) sum += a[i];
        cout << sum << '\n';
    }
    return 0;
}

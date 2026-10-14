// Water Moving (Min): after exactly K moves, minimize the largest cup.
//
// Every cup starts non-empty, so the first move must pour one cup into
// another non-empty cup. After that an empty cup exists, and each remaining
// move can simply pour some cup into an empty cup, which changes nothing about
// the multiset of amounts. So exactly one merge is forced and further merges
// are optional; extra merges never lower the maximum. The best single merge
// combines the two smallest cups:
//   answer = max(max(A), smallest + second smallest).
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
        sort(a.begin(), a.end());
        cout << max(a[n - 1], a[0] + a[1]) << '\n';
    }
    return 0;
}

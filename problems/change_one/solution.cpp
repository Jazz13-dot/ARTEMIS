// Change One: change exactly one element to minimize max(A) - min(A).
//
// The changed element can be set to any value already in the array, so it
// effectively disappears. Removing anything other than the current minimum or
// maximum leaves the range unchanged, so after sorting:
//   answer = min(a[n-1] - a[1], a[n-2] - a[0]).
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
        vector<int> a(n);
        for (auto &x : a) cin >> x;
        sort(a.begin(), a.end());
        cout << min(a[n - 1] - a[1], a[n - 2] - a[0]) << '\n';
    }
    return 0;
}

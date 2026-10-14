// Perfect Sandwiches: split a cheese and b sausage slices into the most
// sandwiches, each with >= 1 sausage and strictly more cheese than sausage.
//
// With k sandwiches we need k <= b (one sausage each) and a >= b + k (each
// sandwich has at least one more cheese than sausage). Both are also
// sufficient: spread sausage over k sandwiches, give each one more cheese than
// its sausage, and dump the leftover cheese on any sandwich. So the answer is
// min(b, a - b), or -1 if that is below 1.
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t;
    cin >> t;
    while (t--) {
        int a, b;
        cin >> a >> b;
        int k = min(b, a - b);
        cout << (k >= 1 ? k : -1) << '\n';
    }
    return 0;
}

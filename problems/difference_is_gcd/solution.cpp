// Difference is GCD: count pairs 1 <= X < Y <= N with gcd(X, Y) = Y - X.
//
// Let d = Y - X. Then gcd(X, Y) = gcd(X, d), which equals d iff d divides X.
// So the pairs are exactly (k*d, (k+1)*d) with k >= 1 and (k+1)*d <= N,
// giving floor(N/d) - 1 pairs per d. Summing over d = 1..N:
//   answer = sum_{d=1}^{N} floor(N/d) - N,
// where the divisor sum is computed in O(sqrt N) by grouping equal quotients.
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    cin >> T;
    while (T--) {
        long long n;
        cin >> n;
        long long sum = 0;
        for (long long d = 1; d <= n;) {
            long long q = n / d, last = n / q;
            sum += q * (last - d + 1);
            d = last + 1;
        }
        cout << sum - n << '\n';
    }
    return 0;
}

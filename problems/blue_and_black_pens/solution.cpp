// Blue and Black Pens: cheaper of 3 blue pens or 1 blue + 1 black pen.
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << min(3 * a, a + b) << '\n';
    return 0;
}

// Example: Infinite recursion
function factorial(n) {
  return n * factorial(n - 1); // forgot the base case!
}
factorial(100);

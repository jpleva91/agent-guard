// Example: Unhandled promise rejection
async function fetchUser() {
  throw new Error('Unhandled promise rejection: API not available');
}
fetchUser();

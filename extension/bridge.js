const namespace = 'leetsync-page-hook';

function validSubmissionId(value) {
  return typeof value === 'string' && /^\d{1,20}$/.test(value);
}

// The page-world hook is not an authentication boundary. Only relay a numeric
// candidate; background.js verifies all facts and fetches source code itself.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.namespace !== namespace) return;
  if (
    event.data.type === 'submission-candidate' &&
    validSubmissionId(event.data.submissionId)
  ) {
    chrome.runtime.sendMessage({
      type: 'submission-candidate',
      submissionId: event.data.submissionId,
    });
  }
});

// Trigger account detection in the isolated extension context, where the
// worker can make an authenticated LeetCode request without exposing cookies.
chrome.runtime.sendMessage({ type: 'leetcode-page-active' });

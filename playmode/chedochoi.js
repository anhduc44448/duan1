// Sync: Functions gửi message về main script.js
function selectMode(mode) {
  console.log("Selecting mode in playmode:", mode);

  // Local feedback (active class)
  document
    .querySelectorAll(".mode-card")
    .forEach((card) => card.classList.remove("active"));
  const selectedCard = document.querySelector(`[data-mode="${mode}"]`);
  if (selectedCard) selectedCard.classList.add("active");

  // Sync: Gửi message về parent (main index.html) để handle socket & navigation
  window.parent.postMessage(
    {
      type: "MODE_SELECTED",
      mode: mode,
    },
    "*"
  );

  console.log("Sent MODE_SELECTED to main");
}

function goBackToHome() {
  // Sync: Gửi message về main để quay home
  window.parent.postMessage(
    {
      type: "GO_BACK",
    },
    "*"
  );
  console.log("Sent GO_BACK to main");
}

// Sync: Init khi load iframe
document.addEventListener("DOMContentLoaded", () => {
  console.log("playmode/chedochoi loaded - ready for sync");
});

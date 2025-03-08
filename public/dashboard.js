document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login";
    return;
  }

  try {
    const response = await fetch("/api/dashboard", {
      method: "GET",
      headers: { Authorization: token },
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("username").innerText = data.username; // Set username
      document.getElementById("dashboard-content").classList.remove("hidden");

      // ✅ Connect to WebSocket Server
      const socket = io(); // Initialize socket connection

      // ✅ Listen for 'socketId' event from server
      socket.on("socketId", (socketId) => {
        document.getElementById("socketId").innerText = socketId; // Update UI
      });
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error("Error:", error);
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
});

function logoutUser() {
  localStorage.removeItem("token");
  window.location.href = "/login";
}

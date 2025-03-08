document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include", // Ensures cookies are sent/received
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Login failed.");
      }

      // Redirect to homepage (or dashboard)
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Error:", error);
      alert(error.message);
    }
  });
});

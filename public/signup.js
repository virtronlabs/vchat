document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signup-form");

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent default form submission

    const formData = new FormData(signupForm); // Collect form data

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        body: formData, // Send form data instead of JSON
      });

      if (response.redirected) {
        window.location.href = response.url; // Follow redirect
      } else {
        const data = await response.json();
        alert(data.message || "Signup failed. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("An error occurred. Please try again later.");
    }
  });
});

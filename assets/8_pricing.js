// Monthly / Yearly switch: prices, billing line and the plan links (Yearly is shown first)
  const setInterval_ = (year) => {
    document.querySelectorAll(".pr-toggle button").forEach((b) => b.classList.toggle("on", (b.dataset.int === "year") === year));
    document.querySelectorAll(".pc-price[data-m]").forEach((el) => {
      el.querySelector("b").textContent = "$" + (year ? +el.dataset.y / 12 : +el.dataset.m);
      const bill = el.nextElementSibling;
      bill.textContent = year ? "Monthly equivalent · $" + el.dataset.y + " charged once a year" : "";
      bill.hidden = !year;
      const link = el.closest(".pc").querySelector(".pc-btn");
      link.href = link.href.replace(/&interval=(year|month)/, "") + "&interval=" + (year ? "year" : "month");
    });
  };
  document.querySelectorAll(".pr-toggle button").forEach((btn) => btn.addEventListener("click", () => setInterval_(btn.dataset.int === "year")));
  setInterval_(true);

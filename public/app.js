(function () {
  "use strict";

  var KEY_STORAGE = "idnpay-sandbox:client-key";
  var THEME_STORAGE = "idnpay-sandbox:theme";
  var REFRESH_MS = 3000;

  var themeToggle = document.getElementById("themeToggle");
  var keyInput = document.getElementById("keyInput");
  var testKey = document.getElementById("testKey");
  var keyStatus = document.getElementById("keyStatus");
  var chargeForm = document.getElementById("chargeForm");
  var paymentType = document.getElementById("paymentType");
  var bankField = document.getElementById("bankField");
  var ewalletField = document.getElementById("ewalletField");
  var submitCharge = document.getElementById("submitCharge");
  var formError = document.getElementById("formError");
  var listStatus = document.getElementById("listStatus");
  var rows = document.getElementById("rows");
  var refresh = document.getElementById("refresh");
  var output = document.getElementById("output");

  var loading = false;

  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    themeToggle.textContent = mode === "dark" ? "Light theme" : "Dark theme";
  }

  var savedTheme = localStorage.getItem(THEME_STORAGE);
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(savedTheme || (systemDark ? "dark" : "light"));

  themeToggle.addEventListener("click", function () {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE, next);
    applyTheme(next);
  });

  keyInput.value = sessionStorage.getItem(KEY_STORAGE) || "";
  keyInput.addEventListener("change", function () {
    sessionStorage.setItem(KEY_STORAGE, keyInput.value);
    setKeyStatus("Not checked", "");
  });

  function setKeyStatus(text, kind) {
    keyStatus.textContent = text;
    keyStatus.className = "status-line" + (kind ? " " + kind : "");
  }

  function setListStatus(text, kind) {
    listStatus.textContent = text;
    listStatus.className = "note" + (kind ? " " + kind : "");
    listStatus.hidden = !text;
  }

  function request(method, path, body) {
    var options = { method: method, headers: { "X-Client-Key": keyInput.value } };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return fetch(path, options).then(function (response) {
      return response.json().then(
        function (data) {
          if (!response.ok) {
            throw new Error(data.status_message || "HTTP " + response.status);
          }
          return data;
        },
        function () {
          throw new Error("HTTP " + response.status + " without a JSON body");
        },
      );
    });
  }

  function showResponse(data) {
    output.textContent = JSON.stringify(data, null, 2);
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearFormError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function togglePaymentFields() {
    bankField.hidden = paymentType.value !== "bank_transfer";
    ewalletField.hidden = paymentType.value !== "ewallet";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function money(value) {
    return "Rp " + Number(value).toLocaleString("id-ID");
  }

  function describeMethod(transaction) {
    if (transaction.payment_type === "bank_transfer") {
      return transaction.bank.toUpperCase() + " " + transaction.va_number;
    }
    if (transaction.payment_type === "ewallet") {
      return transaction.provider;
    }
    return "QRIS";
  }

  function actionButton(label, action, transactionId) {
    var button = el("button", "ghost", label);
    button.type = "button";
    button.addEventListener("click", function () {
      button.disabled = true;
      request("POST", "/v1/simulate/" + action, { transaction_id: transactionId })
        .then(function (transaction) {
          showResponse(transaction);
          return loadTransactions();
        })
        .catch(function (error) {
          showResponse({ error: error.message });
          button.disabled = false;
        });
    });
    return button;
  }

  function emptyRow(message) {
    var row = el("tr");
    var cell = el("td", "empty", message);
    cell.colSpan = 5;
    row.appendChild(cell);
    rows.appendChild(row);
  }

  function renderRows(transactions) {
    rows.textContent = "";

    if (transactions.length === 0) {
      emptyRow(
        keyInput.value
          ? "No transactions yet. Create one in step 02."
          : "Connect first, then create a charge.",
      );
      return;
    }

    transactions.forEach(function (transaction) {
      var row = el("tr");
      row.appendChild(el("td", "mono", transaction.order_id));
      row.appendChild(el("td", "mono", describeMethod(transaction)));
      row.appendChild(el("td", "amount mono", money(transaction.gross_amount)));
      row.appendChild(
        el("td", "status status-" + transaction.transaction_status, transaction.transaction_status),
      );

      var actions = el("td");
      if (transaction.transaction_status === "PENDING") {
        actions.appendChild(actionButton("Pay", "pay", transaction.transaction_id));
        actions.appendChild(actionButton("Fail", "fail", transaction.transaction_id));
        actions.appendChild(actionButton("Expire", "expire", transaction.transaction_id));
      } else {
        actions.textContent = "Finished";
      }
      row.appendChild(actions);

      rows.appendChild(row);
    });
  }

  function loadTransactions() {
    if (loading) {
      return Promise.resolve();
    }
    if (!keyInput.value) {
      renderRows([]);
      setListStatus("");
      return Promise.resolve();
    }

    loading = true;
    setListStatus("Loading transactions...");
    return request("GET", "/v1/transactions?limit=50")
      .then(function (data) {
        renderRows(data.data);
        setListStatus("");
      })
      .catch(function (error) {
        renderRows([]);
        setListStatus(
          "Could not load transactions: " + error.message + " Press Refresh to try again.",
          "error",
        );
      })
      .finally(function () {
        loading = false;
      });
  }

  paymentType.addEventListener("change", togglePaymentFields);
  togglePaymentFields();

  testKey.addEventListener("click", function () {
    setKeyStatus("Checking...", "");
    request("GET", "/v1/transactions?limit=1")
      .then(function (data) {
        showResponse(data);
        setKeyStatus("Connected", "ok");
        return loadTransactions();
      })
      .catch(function (error) {
        setKeyStatus("Not connected", "error");
        showResponse({ error: error.message });
      });
  });

  chargeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    clearFormError();

    var form = new FormData(chargeForm);
    var type = paymentType.value;
    var body = {
      order_id: form.get("order_id"),
      gross_amount: Number(form.get("gross_amount")),
      payment_type: type,
      callback_url: form.get("callback_url"),
    };
    if (type === "bank_transfer") {
      body.bank = form.get("bank");
    }
    if (type === "ewallet") {
      body.ewallet = form.get("ewallet");
    }

    submitCharge.disabled = true;
    request("POST", "/v1/charge", body)
      .then(function (transaction) {
        showResponse(transaction);
        setKeyStatus("Connected", "ok");
        return loadTransactions();
      })
      .catch(function (error) {
        showFormError(error.message);
        showResponse({ error: error.message });
      })
      .finally(function () {
        submitCharge.disabled = false;
      });
  });

  refresh.addEventListener("click", function () {
    loadTransactions();
  });

  setInterval(function () {
    if (document.visibilityState === "visible" && keyInput.value) {
      loadTransactions();
    }
  }, REFRESH_MS);

  loadTransactions();
})();

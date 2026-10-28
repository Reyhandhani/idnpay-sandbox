(function () {
  "use strict";

  var KEY_STORAGE = "idnpay-sandbox:client-key";
  var REFRESH_MS = 3000;

  var keyInput = document.getElementById("keyInput");
  var testKey = document.getElementById("testKey");
  var keyStatus = document.getElementById("keyStatus");
  var chargeForm = document.getElementById("chargeForm");
  var paymentType = document.getElementById("paymentType");
  var bankField = document.getElementById("bankField");
  var ewalletField = document.getElementById("ewalletField");
  var submitCharge = document.getElementById("submitCharge");
  var formError = document.getElementById("formError");
  var chargeResult = document.getElementById("chargeResult");
  var chargeDetails = document.getElementById("chargeDetails");
  var chargeHint = document.getElementById("chargeHint");
  var rows = document.getElementById("rows");
  var refresh = document.getElementById("refresh");
  var output = document.getElementById("output");

  var loading = false;

  keyInput.value = sessionStorage.getItem(KEY_STORAGE) || "";
  keyInput.addEventListener("change", function () {
    sessionStorage.setItem(KEY_STORAGE, keyInput.value);
    setKeyStatus("Not checked", "");
  });

  function setKeyStatus(text, kind) {
    keyStatus.textContent = text;
    keyStatus.className = "badge" + (kind ? " " + kind : "");
  }

  function request(method, path, body) {
    var options = {
      method: method,
      headers: { "X-Client-Key": keyInput.value },
    };
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
          throw new Error("HTTP " + response.status + " with no JSON body");
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

  paymentType.addEventListener("change", togglePaymentFields);
  togglePaymentFields();

  testKey.addEventListener("click", function () {
    setKeyStatus("Checking...", "");
    request("GET", "/v1/transactions?limit=1")
      .then(function (data) {
        showResponse(data);
        setKeyStatus("Connected", "ok");
      })
      .catch(function (error) {
        setKeyStatus("Not connected", "error");
        showResponse({ error: error.message });
      });
  });

  function detail(label, value, mono) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    if (mono) {
      var code = document.createElement("code");
      code.textContent = value;
      dd.appendChild(code);
    } else {
      dd.textContent = value;
    }
    chargeDetails.appendChild(dt);
    chargeDetails.appendChild(dd);
  }

  function showCharge(transaction) {
    chargeDetails.textContent = "";
    detail("order_id", transaction.order_id, true);
    detail("amount", "Rp " + Number(transaction.gross_amount).toLocaleString("id-ID"));
    detail("status", transaction.transaction_status);
    detail("expires at", transaction.expiry_time + " WIB");

    if (transaction.payment_type === "qris") {
      detail("QR string", transaction.qr_string, true);
      chargeHint.textContent =
        "Render qr_string as a QR code if you need one, or go straight to step 3 and click Pay.";
    } else if (transaction.payment_type === "bank_transfer") {
      detail("bank", transaction.bank.toUpperCase());
      detail("VA number", transaction.va_number, true);
      chargeHint.textContent = "Use the VA number above in your app, or go to step 3 and click Pay.";
    } else {
      detail("provider", transaction.provider);
      detail("deeplink", transaction.deeplink_url, true);
      chargeHint.textContent = "The deeplink does not open a real app. Go to step 3 and click Pay.";
    }

    chargeResult.hidden = false;
    chargeResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

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
        showCharge(transaction);
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
    var button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = label;
    button.addEventListener("click", function () {
      button.disabled = true;
      request("POST", "/v1/simulate/" + action, { transaction_id: transactionId })
        .then(function (transaction) {
          showResponse(transaction);
          return loadTransactions();
        })
        .catch(function (error) {
          showResponse({ error: error.message });
        })
        .finally(function () {
          button.disabled = false;
        });
    });
    return button;
  }

  function emptyRow(message) {
    var row = document.createElement("tr");
    var cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = message;
    row.appendChild(cell);
    rows.appendChild(row);
  }

  function renderRows(transactions) {
    rows.textContent = "";
    if (transactions.length === 0) {
      emptyRow("No transactions yet. Create one in step 2.");
      return;
    }

    transactions.forEach(function (transaction) {
      var row = document.createElement("tr");

      var orderCell = document.createElement("td");
      orderCell.className = "mono";
      orderCell.textContent = transaction.order_id;
      row.appendChild(orderCell);

      var methodCell = document.createElement("td");
      methodCell.className = "mono";
      methodCell.textContent = describeMethod(transaction);
      row.appendChild(methodCell);

      var amountCell = document.createElement("td");
      amountCell.textContent = "Rp " + Number(transaction.gross_amount).toLocaleString("id-ID");
      row.appendChild(amountCell);

      var statusCell = document.createElement("td");
      var status = document.createElement("span");
      status.className = "status status-" + transaction.transaction_status;
      status.textContent = transaction.transaction_status;
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      var actionCell = document.createElement("td");
      if (transaction.transaction_status === "PENDING") {
        actionCell.appendChild(actionButton("Pay", "pay", transaction.transaction_id));
        actionCell.appendChild(actionButton("Fail", "fail", transaction.transaction_id));
        actionCell.appendChild(actionButton("Expire", "expire", transaction.transaction_id));
      } else {
        actionCell.textContent = "—";
      }
      row.appendChild(actionCell);

      rows.appendChild(row);
    });
  }

  function loadTransactions() {
    if (loading) {
      return Promise.resolve();
    }
    if (!keyInput.value) {
      rows.textContent = "";
      emptyRow("Set your client key in step 1 to load transactions.");
      return Promise.resolve();
    }
    loading = true;
    return request("GET", "/v1/transactions?limit=50")
      .then(function (data) {
        renderRows(data.data);
      })
      .catch(function (error) {
        rows.textContent = "";
        emptyRow("Could not load transactions: " + error.message);
      })
      .finally(function () {
        loading = false;
      });
  }

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

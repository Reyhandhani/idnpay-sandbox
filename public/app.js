(function () {
  "use strict";

  var KEY_STORAGE = "idnpay-sandbox:client-key";

  var clientKeyInput = document.getElementById("clientKey");
  var chargeForm = document.getElementById("chargeForm");
  var rows = document.getElementById("rows");
  var output = document.getElementById("output");
  var refreshButton = document.getElementById("refresh");

  clientKeyInput.value = sessionStorage.getItem(KEY_STORAGE) || "";
  clientKeyInput.addEventListener("change", function () {
    sessionStorage.setItem(KEY_STORAGE, clientKeyInput.value);
  });

  function request(method, path, body) {
    var options = {
      method: method,
      headers: { "X-Client-Key": clientKeyInput.value },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return fetch(path, options).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      });
    });
  }

  function show(result) {
    output.textContent = JSON.stringify(result.data, null, 2);
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

  function renderRows(transactions) {
    rows.textContent = "";
    if (transactions.length === 0) {
      var empty = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "No transactions yet.";
      empty.appendChild(cell);
      rows.appendChild(empty);
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
      }
      row.appendChild(actionCell);

      rows.appendChild(row);
    });
  }

  function actionButton(label, action, transactionId) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = label;
    button.addEventListener("click", function () {
      request("POST", "/v1/simulate/" + action, { transaction_id: transactionId })
        .then(function (result) {
          show(result);
          return loadTransactions();
        })
        .catch(showError);
    });
    return button;
  }

  function loadTransactions() {
    return request("GET", "/v1/transactions?limit=50").then(function (result) {
      if (!result.ok) {
        show(result);
        return;
      }
      renderRows(result.data.data);
    });
  }

  function showError(error) {
    output.textContent = "Request failed: " + error.message;
  }

  chargeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var form = new FormData(chargeForm);
    var paymentType = form.get("payment_type");
    var body = {
      order_id: form.get("order_id"),
      gross_amount: Number(form.get("gross_amount")),
      payment_type: paymentType,
      callback_url: form.get("callback_url"),
    };
    if (paymentType === "bank_transfer") {
      body.bank = form.get("bank");
    }
    if (paymentType === "ewallet") {
      body.ewallet = form.get("ewallet");
    }

    request("POST", "/v1/charge", body)
      .then(function (result) {
        show(result);
        return loadTransactions();
      })
      .catch(showError);
  });

  refreshButton.addEventListener("click", function () {
    loadTransactions().catch(showError);
  });

  loadTransactions().catch(showError);
})();

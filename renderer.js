const { ipcRenderer } = require('electron');

// Listen for the 'display-invoices' event from the main process
ipcRenderer.on('display-invoices', (event, data) => {
  console.log('Received data:', data); // Log the data received from the main process

  if (data.message) {
    document.getElementById('invoiceContainer').innerHTML = `<p>${data.message}</p>`;
  } else if (data.invoices && Array.isArray(data.invoices)) {
    displayInvoices(data.invoices);
  } else {
    console.error('Invalid data format:', data);
    document.getElementById('invoiceContainer').innerHTML = '<p>No invoices found or invalid data format.</p>';
  }
});

// Function to display invoices
function displayInvoices(invoices) {
  const container = document.getElementById('invoiceContainer');

  if (!invoices || invoices.length === 0) {
    container.innerHTML = '<p>No invoices found.</p>';
    return;
  }

  // Clear previous content
  container.innerHTML = '';

  // Create and append invoice elements
  invoices.forEach(invoice => {
    const invoiceElement = document.createElement('div');
    invoiceElement.className = 'invoice';
    invoiceElement.innerHTML = `
      <h3>Document Number: ${data.DocNum}</h3>
      <p>Date: ${invoice.DocDate}</p>
      <p>Card Name: ${invoice.CardName}</p>
      <p>Description: ${invoice.Dscription}</p>
      <p>Quantity: ${invoice.quantity}</p>
      <p>Price: ${invoice.Price}</p>
      <p>Total Without Tax: ${invoice['Total Without Tax']}</p>
      <p>Tax Subtotal: ${invoice['Tax SubTotal']}</p>
      <p>Total with Tax: ${invoice['Total with Tax']}</p>
      <p>Payable Amount: ${invoice['Payable Amount']}</p>
      <p>VAT Sum: ${invoice.vatsum}</p>
      <p>Line Total: ${invoice.LineTotal}</p>
    `;
    container.appendChild(invoiceElement);
  });
}

// Listen for the 'display-invoice-details' event from the main process
ipcRenderer.on('display-invoice-details', (event, data) => {
  console.log('Received invoice data for details window:', data); // Log the data received
  
  if (data) {
    // Populate invoice header information
    document.getElementById('invoice-date').textContent = `Invoice Date: ${data.DocDate}`;
    document.getElementById('invoice-number').textContent = `Invoice Number: ${data.DocNum}`;
    
    // Populate the items table
    const tableBody = document.getElementById('invoice-table-body');
    tableBody.innerHTML = ''; // Clear previous entries
    
    // Assuming your invoice object has an Item array
    if (Array.isArray(data.Item)) {
      data.Item.forEach(item => {
        tableBody.innerHTML += `
          <tr>
            <td>${item.LineTotal.toFixed(2)}</td>
            <td>${item.Price.toFixed(2)}</td>
            <td>${item.totalwithTax}</td>
            <td>${item.Description}</td>
            <td>${item.quantity}</td>
            <td>${item.uomcode}</td>
          </tr>
        `;
      });
    }

    // Populate totals
    document.getElementById('total-before-vat').textContent = data.TotalExclusiveAmt?.toFixed(2) || '0.00';
    document.getElementById('discount').textContent = '0.00'; // If no discount is provided
    document.getElementById('vat-value').textContent = data.VatSum?.toFixed(2) || '0.00';
    document.getElementById('total-invoice').textContent = data.DocTotal?.toFixed(2) || '0.00';

       // Display QR Code Image from the path received from backend
       const qrCodeImagePath = data.processRes.qrCodeImagePath; // Accessing qrCodeImagePath from processRes
       const qrCodeContainer = document.querySelector('.qr-code-container');
       
       if (qrCodeImagePath) {
         qrCodeContainer.innerHTML = `<img src="file://${qrCodeImagePath}" alt="QR Code" style="width:200px; height:200px;">`; // Setting src to QR code path
       } else {
         console.error('QR Code path is null or undefined.');
         qrCodeContainer.innerHTML = '<p>No QR code available.</p>'; // Fallback message
       }
     } else {
       document.querySelector('.invoice-container').innerHTML = '<p>No details available.</p>';
     }ent.querySelector('.invoice-container').innerHTML = '<p>No details available.</p>';
  });



// Function to show QR code

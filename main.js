const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const QRCode = require('qrcode');
const moment = require('moment');

let mainWindow;
let detailsWindow;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
}

// Create the details window
function createDetailsWindow() {
  if (detailsWindow) {
    detailsWindow.focus();
    return;
  }

  detailsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Invoice Details',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  detailsWindow.loadFile('invoice-details.html');

  detailsWindow.on('closed', () => {
    detailsWindow = null;
  });
}

// Handle 'fetch-invoices' IPC event
ipcMain.on('fetch-invoices', async (event, selectedDate) => {
  try {
    const formattedDate = moment(selectedDate).format('YYYY-MM-DD');
    console.log(`Triggering backend process for date: ${formattedDate}`);

    // Trigger the backend process to generate the invoices
    const response = await axios.get(`http://localhost:3000/invoices/generateInvoiceJsonForToday/${formattedDate}`);

    const invoices = response.data.responses; // Assuming backend returns an array of invoice objects

    console.log('Invoices received from backend:', invoices);

    // Send the invoices data to the frontend for display
    event.reply('display-invoices', { invoices });

    // Simulate sending status and QR codes for each invoice
    invoices.forEach(async (invoice, index) => {
      // Simulate status: success or failed
      const status = invoice.status || 'success';

      // Generate QR code from invoice details (you may adjust what data is used)
      const qrCodeData = await QRCode.toDataURL(invoice.DocNum || 'Default QR Data');
      event.reply('invoice-status-update', { index, status, qrCode: qrCodeData });
    });

  } catch (error) {
    console.error('Error processing invoices:', error.message);
    event.reply('display-invoices', { message: 'Error processing invoices. Please try again.' });
  }
});


// Retry invoice submission (if needed)
ipcMain.on('retry-invoice', (event, index) => {
  // Handle retry logic here
  console.log(`Retrying invoice at index ${index}`);
});



ipcMain.on('view-invoice-details', (event, invoiceData) => {
  createDetailsWindow();

  detailsWindow.webContents.once('did-finish-load', () => {
    console.log('Sending invoice details to details window:', invoiceData);  // Added log for verification
    detailsWindow.webContents.send('display-invoice-details', invoiceData);
  });
});




// Handle 'retry-all' IPC event
ipcMain.on('retry-all', async (event, selectedDate) => {
  try {
    const formattedDate = moment(selectedDate).format('YYYY-MM-DD');
    if (!moment(formattedDate, 'YYYY-MM-DD', true).isValid()) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD.');
    }

    const response = await axios.get(`http://localhost:3000/invoices?date=${formattedDate}`);
    const invoices = response.data.invoices;
    const failedInvoices = invoices.filter(invoice => invoice.status === 'Failed');

    console.log('Retrying all failed invoices:', failedInvoices);
    event.reply('retry-all-completed', failedInvoices.length);
  } catch (error) {
    console.error('Error fetching invoices for retry from backend:', error.message || error);
  }
});

// Handle 'generate-qr' IPC event
ipcMain.handle('generate-qr', async (event, text) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(text);
    console.log('QR Code generated successfully:', qrCodeDataUrl);
    return qrCodeDataUrl;
  } catch (err) {
    console.error('Error generating QR code:', err);
    return null;
  }
});

app.whenReady().then(() => {
  createWindow();

  // Open the DevTools for debugging
  mainWindow.webContents.openDevTools();

  // If you need to set up any global IPC listeners or handlers, you can do it here
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});

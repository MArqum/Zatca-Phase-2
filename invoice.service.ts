import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { create } from 'xmlbuilder2';
import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import elliptic from 'elliptic';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import moment from 'moment';
import * as xml2js from 'xml2js';
import * as QRCode from 'qrcode';
import { parseStringPromise } from 'xml2js';

interface InvoiceData {
    docentry: number;
    DocNum: number;
    DocDate: string;
    CreateTS: number;
    RegNum: string;
    LicTradNum: string;
    Street: string | null;
    Block: string | null;
    BUILDING: string | null;
    STREETNO: string | null;
    City: string | null;
    ZipCode: string | null;
    CardName: string;
    'Tax SubTotal': number;
    'Total Exclusive Amt': number;
    DocTotal: number;
    'Payable Amount': number;
    Dscription: string;
    quantity: number;
    Price: number;
    uomcode: string;
    LineTotal: number;
    VatSum: number;
    'Total Without Tax': number;
  }

@Injectable()
export class InvoiceService {
  private sdkDirPath: string;
  private fatooraBatPath: string;
  private previousInvoiceHash: string | null = null;


  private csrFilePath = 'D:/Certificates/certificate.pem';  // Path to the saved CSR
  private otp: number | undefined;
  zatcaUri = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance';
  zatcaUrll = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/production/csids';
  reportingApiUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/invoices/reporting/single'


    constructor(@InjectConnection() private readonly connection: Connection,) {
      
      this.sdkDirPath = `C:\\Users\\arqum\\Downloads\\zatca-einvoicing-sdk-238-R3.3.4\\zatca-einvoicing-sdk-238-R3.3.4\\Apps`;
      this.fatooraBatPath = path.join(this.sdkDirPath, 'fatoora.bat');
    }
    private ZATCA_API_URL = 'https://sandbox.zatca.gov.sa/e-invoicing/developer-portal'; // Update with the actual ZATCA API URL
    // Function to generate OTP

    async generateInvoiceJson() {
      try {
          const query = `
          SELECT t0.docentry, T0.[DocNum], T0.[DocDate], T0.[CreateTS], T2.RegNum, T2.[LicTradNum],
          T2.[CardName], t0.VatSum as "Tax SubTotal",
          T3.[Street], T3.[Block], T3.BUILDING, T3.STREETNO, T3.[City], T3.[ZipCode],
          t1.Dscription as "Description", t1.quantity, T1.Price, t1.uomcode, t1.LineTotal, t1.VatSum, t1.GTotal as "total with Tax",
          T0.[DocTotal] / 1.15 as "Total Exclusive Amt", T0.[DocTotal], T0.[DocTotal] as "Payable Amount"
          FROM OINV T0
          INNER JOIN INV1 T1 ON T0.[DocEntry] = T1.[DocEntry]
          INNER JOIN OCRD T2 ON T0.[CardCode] = T2.[CardCode]
          INNER JOIN CRD1 T3 ON T2.[CardCode] = T3.[CardCode>
          `;
  
          const result: any[] = await this.connection.query(query);
  
          // If no data is returned, log a message and return
          if (result.length === 0) {
              return { message: 'No data found' };
          }
  
          // Function to format CreateTS field
          const formatCreateTS = (createTS: number) => {
              const hours = Math.floor(createTS / 10000);
              const minutes = Math.floor((createTS % 10000) / 100);
              const seconds = createTS % 100;
              return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          };
  
          // Clean keys by removing spaces
          const cleanKeys = (obj: any) => {
              const cleanedObj: any = {};
              for (const [key, value] of Object.entries(obj)) {
                  const cleanedKey = key.replace(/\s+/g, ''); // Remove spaces from keys
                  cleanedObj[cleanedKey] = value;
              }
              return cleanedObj;
          };
  
          // Define additional fields to be added
          const additionalFields = {
              pih: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==",
              CompanyName: "شركة قطاف العائله المحدودة",
              VATNo: 310209740700003,
              CityName: "Tabuk",
              Buildingno: 6620,
              Districk: "Salihah",
              StreetName: "Muin Ibn Zaidah",
              UnitNo: 2653,
              Zipcode: 47912,
              Status: "Imported"
          };
  
          // Group and merge records by DocNum
          const mergedInvoices: any = {};
  
          result.forEach(record => {
              // Adjust date by adding 1 day (as per your original logic)
              let docDate: Date;
              if (typeof record.DocDate === 'string') {
                  docDate = new Date(record.DocDate);
              } else if (record.DocDate instanceof Date) {
                  docDate = record.DocDate;
              } else {
                  throw new Error('Unexpected date format');
              }
              docDate.setDate(docDate.getDate() + 1);
              record.DocDate = docDate.toISOString().split('T')[0];
  
              // Clean record and format CreateTS
              const cleanedRecord = cleanKeys({
                  ...record,
                  CreateTS: formatCreateTS(record.CreateTS),
                  ...additionalFields // Spread additional fields here
              });
  
              const { DocNum, Description, quantity, Price, uomcode, LineTotal, VatSum, totalwithTax } = cleanedRecord;
  
              if (!mergedInvoices[DocNum]) {
                  // Initialize a new invoice entry
                  mergedInvoices[DocNum] = { ...cleanedRecord, Item: [] };
              }
  
              // Add line items to the Item array
              mergedInvoices[DocNum].Item.push({
                  Description,
                  quantity,
                  Price,
                  uomcode,
                  LineTotal,
                  VatSum,
                  totalwithTax
              });
          });
  
          // Convert mergedInvoices back into an array
          const mergedData = Object.values(mergedInvoices);
  
          // Ensure the directory exists
          const outputDir = path.join(__dirname, '../../../zatcaData');
          if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
          }
  
          // Write JSON files for each date
          const groupedByDate = mergedData.reduce((acc: any, current: any) => {
              const docDate = current.DocDate;
              if (!acc[docDate]) {
                  acc[docDate] = [];
              }
              acc[docDate].push(current);
              return acc;
          }, {});
  
          for (const [date, data] of Object.entries(groupedByDate)) {
              const filePath = path.join(outputDir, `invoices_${date}.json`);
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          }
  
          return { message: 'JSON files generated successfully' };
  
      } catch (error) {
          throw new Error('Failed to generate JSON files');
      }
  }
  
    
  
    async generateInvoiceJsonForDate(date: string) {
      try {
          // Validate and format the provided date
          const formattedDate = moment(date, 'YYYY-MM-DD', true).format('YYYY-MM-DD');
          console.log(formattedDate);
          if (!moment(formattedDate, 'YYYY-MM-DD', true).isValid()) {
              throw new Error('Invalid date format. Please use YYYY-MM-DD.');
          }
  
          // SQL query to get data for the specified date
          const query = `
              SELECT t0.docentry, T0.[DocNum], T0.[DocDate], T0.[CreateTS], T2.RegNum, T2.[LicTradNum],
              T2.[CardName], t0.VatSum as "Tax SubTotal",
              T3.[Street], T3.[Block], T3.BUILDING, T3.STREETNO, T3.[City], T3.[ZipCode],
              t1.Dscription as "Description", t1.quantity, T1.Price, t1.uomcode, T1.LineTotal, t1.VatSum, t1.GTotal as "total with Tax",
              T0.[DocTotal] / 1.15 as "Total Exclusive Amt", T0.[DocTotal], T0.[DocTotal] as "Payable Amount"
              FROM OINV T0
              INNER JOIN INV1 T1 ON T0.[DocEntry] = T1.[DocEntry]
              INNER JOIN OCRD T2 ON T0.[CardCode] = T2.[CardCode]
              INNER JOIN CRD1 T3 ON T2.[CardCode] = T3.[CardCode]
              WHERE CAST(T0.[DocDate] AS DATE) = '${formattedDate}';
          `;
  
          const result: any[] = await this.connection.query(query);
  
          // If no data is returned, log a message and return
          if (result.length === 0) {
              return { message: 'No data found for the specified date' };
          }
  
          // Additional fields to be added to each invoice
          const additionalFields = {
              pih: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==",
              CompanyName: "شركة قطاف العائله المحدودة",
              VATNo: 310209740700003,
              CityName: "Tabuk",
              Buildingno: 6620,
              Districk: "Salihah",
              StreetName: "Muin Ibn Zaidah",
              UnitNo: 2653,
              Zipcode: 47912,
              Status: "Imported"
          };
  
          // Function to format CreateTS field
          const formatCreateTS = (createTS: number) => {
              const hours = Math.floor(createTS / 10000);
              const minutes = Math.floor((createTS % 10000) / 100);
              const seconds = createTS % 100;
              return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          };
  
          // Clean keys by removing spaces
          const cleanKeys = (obj: any) => {
              const cleanedObj: any = {};
              for (const [key, value] of Object.entries(obj)) {
                  const cleanedKey = key.replace(/\s+/g, ''); // Remove spaces from keys
                  cleanedObj[cleanedKey] = value;
              }
              return cleanedObj;
          };
  
          // Merge records based on DocNum
          const mergedInvoices: any = {};
          result.forEach(record => {
              const cleanedRecord = cleanKeys({
                  ...record, // Include all dynamically fetched fields from the database
                  DocDate: formattedDate, // Format DocDate
                  CreateTS: formatCreateTS(record.CreateTS), // Format CreateTS
                  ...additionalFields // Spread additional fields here
              });
  
              const { DocNum, Description, quantity, Price, uomcode, LineTotal, VatSum, totalwithTax } = cleanedRecord;
              if (!mergedInvoices[DocNum]) {
                  // Create a new invoice entry if DocNum is encountered for the first time
                  mergedInvoices[DocNum] = { ...cleanedRecord, Item: [] };
              }
              // Add the current line item to the Item array
              mergedInvoices[DocNum].Item.push({
                  Description,
                  quantity,
                  Price,
                  uomcode,
                  LineTotal,
                  VatSum,
                  totalwithTax
              });
          });
  
          // Convert mergedInvoices back into an array for the JSON file
          const mergedData = Object.values(mergedInvoices);
  
          // Ensure the directory exists
          const outputDir = path.join(__dirname, '../../../');
          if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
          }
  
          // File path for the specified date's data
          const filePath = path.join(outputDir, `invoices_${formattedDate}.json`);
          // Write data to JSON file
          fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2));
          
          return { message: 'JSON file for the specified date generated successfully', data: mergedData };
      } catch (error) {
          throw new Error('Failed to generate JSON file for the specified date');
      }
  }
  


    async submitCsr(otp: number) {
      if (!otp) {
          throw new Error('OTP is required.');
      }
  
      const csr = 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURSBSRVFVRVNULS0tLS0KTUlJQ1JUQ0NBZXdDQVFBd2JqRUxNQWtHQTFVRUJoTUNVMEV4RXpBUkJnTlZCQXNNQ2pNMU5UQXhNak0wTXpNeApJVEFmQmdOVkJBb01HRkZwZEdGbUlFWmhiV2xzZVNCRGIyMXdZVzU1SUV4VVJERW5NQ1VHQTFVRUF3d2VWRk5VCkxUTTFOVEF4TWpNME16TXRNekV3TWpBNU56UXdOekF3TURBek1GWXdFQVlIS29aSXpqMENBUVlGSzRFRUFBb0QKUWdBRWhnSTU2R08zd3g0VCt0ZTlMSFViRFRvMFZRZU9yWWIxRS95UWNVbXZCMURSeGo2RmFYNXBMQ0FhblgvYQo0OStQcEx0V2JBenBzci95OGxmZ1dlVVY5YUNDQVIwd2dnRVpCZ2txaGtpRzl3MEJDUTR4Z2dFS01JSUJCakFoCkJna3JCZ0VFQVlJM0ZBSUVGQXdTV2tGVVEwRXRRMjlrWlMxVGFXZHVhVzVuTUlIZ0JnTlZIUkVFZ2Rnd2dkV2sKZ2RJd2djOHhPekE1QmdOVkJBUU1NakV0VkZOVWZESXRWRk5VZkRNdFpXUXlNbVl4WkRndFpUWmhNaTB4TVRFNApMVGxpTlRndFpEbGhPR1l4TVdVME5EVm1NUjh3SFFZS0NaSW1pWlB5TEdRQkFRd1BNekV3TWpBNU56UXdOekF3Ck1EQXpNUTB3Q3dZRFZRUU1EQVF3TVRBd01VTXdRUVlEVlFRYUREbzJOakl3SUUxMWFXNGdTV0p1SUZwaGFXUmgKYUNBeU5qVXpJRUZzWVhwcGVtbDVZV2dnUVd4eFlXUnBiV0ZvSUZSaFluVnJJRFEzT1RFeU1Sc3dHUVlEVlFRUApEQkpHYjI5a0lHRnVaQ0JYYUc5c1pYTmhiR1V3Q2dZSUtvWkl6ajBFQXdJRFJ3QXdSQUlnTXRwUWQ2OUlac3hFCmczK2F6WSswUzVEcWNaWXUrRGVVc01KRFM5ZHlKdzhDSUZZak1nYkZtS2xhRE1mamdOaHRkY2p4NUFYc2JGdkwKRUMvblFuUUw3ZWJECi0tLS0tRU5EIENFUlRJRklDQVRFIFJFUVVFU1QtLS0tLQo=';  // Assuming this is generated or loaded from file
      const headers = {
        'Content-Type': 'application/json',
        'Accept-Version': 'V2',
        'OTP': otp,
    };

    const body = { csr, otp };

    console.log('Submitting CSR with body:', body); // Log the request body

    try {
        const response = await axios.post(this.zatcaUri, body, { headers });
        console.log('CSR submitted successfully. Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error submitting CSR:', error.response?.data || error.message);
        throw new Error('Failed to submit CSR');
    }
  }


  async runFatooraSdk(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startSdkCommand = `cd ${this.sdkDirPath} && fatoora.bat`;
      exec(startSdkCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error starting Fatoora SDK: ${error.message}`);
          reject(stderr);
        } else {
          console.log(`Fatoora SDK started successfully: ${stdout}`);
          resolve(); // SDK has been started successfully
        }
      });
    });
  }
  
  invoiceCounter = 1;

  async signInvoice(xmlFilePath: string): Promise<{ signedXmlPath: string, invoiceHash: string, qrCodeImagePath: string }> {
    return new Promise((resolve, reject) => {
        // Normalize the signed XML path to ensure it is in the correct format
        const signedXmlPath = path.normalize(path.join(path.dirname(xmlFilePath), `signed-invoice-${this.invoiceCounter}.xml`));

        // Construct the command for signing the invoice using Fatoora SDK
        const signCommand = `fatoora -sign -invoice ${xmlFilePath} -signedInvoice ${signedXmlPath}`;

        // Execute the command
        exec(signCommand, { cwd: this.sdkDirPath }, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Error signing the invoice: ${error.message}`);
                reject(stderr);
                return;
            }

            console.log(`Invoice signed successfully: ${stdout}`);

            const hashMatch = stdout.match(/INVOICE HASH = ([A-Za-z0-9+/=]+)/);
            const invoiceHash = hashMatch ? hashMatch[1] : null;

            if (invoiceHash) {
                this.saveInvoiceHash(invoiceHash);
                console.log(`Stored Invoice Hash: ${invoiceHash}`);
            }

            this.invoiceCounter++;

            try {
                // Step 1: Extract QR code from the signed XML file
                const signedXml = fs.readFileSync(signedXmlPath, 'utf8');
                
                const qrCodeBase64 = await this.extractQrCodeFromXml(signedXml);

                if (!qrCodeBase64) {
                    console.warn('QR code not found in the XML.');
                    resolve({ signedXmlPath, invoiceHash, qrCodeImagePath: null });
                    return;
                }

                // Step 2: Decode the base64 QR code
                const decodedQrCode = Buffer.from(qrCodeBase64, 'base64').toString('utf8');

                // Step 3: Generate QR code image
                const qrCodeImagePath = path.normalize(path.join(path.dirname(xmlFilePath), `qr-code-${this.invoiceCounter}.png`));
                await QRCode.toFile(qrCodeImagePath, decodedQrCode);

                console.log(`QR code image saved at: ${qrCodeImagePath}`);

                resolve({ signedXmlPath, invoiceHash, qrCodeImagePath });
            } catch (parseError) {
                reject(`Error processing the XML or QR code: ${parseError.message}`);
            }
        });
    });
}


// Helper function to extract QR code from signed XML
async extractQrCodeFromXml(xml: string): Promise<string | null> {
    const parsedXml = await parseStringPromise(xml, { explicitArray: false });

    // Log the parsed XML structure for debugging
    console.log("Parsed XML:", JSON.stringify(parsedXml, null, 2));

    const documentReferences = parsedXml['Invoice']?.['cac:AdditionalDocumentReference'];

    if (!documentReferences) {
        console.warn('No AdditionalDocumentReference found in XML.');
        return null;
    }

    // Iterate over document references to find the QR code
    for (const reference of documentReferences) {
        const idElement = reference['cbc:ID'];
        const embeddedDoc = reference['cac:Attachment']?.['cbc:EmbeddedDocumentBinaryObject'];

        if (idElement === 'QR' && embeddedDoc) {
            return embeddedDoc._ || embeddedDoc;
        }
    }

    return null;
}


validateInvoice(signedXmlPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
      const validateCommand = `fatoora -validate -invoice ${signedXmlPath}`;

      console.log(`Executing validation command: ${validateCommand}`); // Log the command

      exec(validateCommand, { cwd: this.sdkDirPath }, (error, stdout, stderr) => {
          if (error) {
              console.error(`Error validating the signed invoice: ${error.message}`);
              console.error(`Validation stderr: ${stderr}`); // Log stderr for more insights
              reject(stderr);
          } else {
              console.log(`Invoice validated successfully: ${stdout}`);
              resolve(stdout); // Return the validation output
          }
      });
  });
}



async processInvoice(reportResponse: string): Promise<any> {
  try {
      const xmlFilePath = reportResponse;
      await this.runFatooraSdk();

      const { signedXmlPath, invoiceHash, qrCodeImagePath } = await this.signInvoice(xmlFilePath);

      const validationResponse = await this.validateInvoice(signedXmlPath);

      return {
          validationResponse,
          qrCodeImagePath,
          signedXmlPath: path.normalize(signedXmlPath), // Ensure the path is properly formatted
          invoiceHash 
      };
  } catch (error) {
      console.error('Error in processInvoice:', error);
      throw error;
  }
}



  getPreviousInvoiceHash(): string | null {
    return this.previousInvoiceHash;
  }

  saveInvoiceHash(hash: string) {
    const filePath = path.join(__dirname, 'previousInvoiceHash.txt');
    fs.writeFileSync(filePath, hash, 'utf-8');
    console.log(`Invoice hash saved to ${filePath}`);
}

      
      
          generateEcCsr() {
            // Initialize elliptic EC with P-256 curve (secp256r1)
            const EC = elliptic.ec;
            const ec = new EC('p256');  // secp256r1 (P-256 curve)
        
            // Generate EC key pair
            const keypair = ec.genKeyPair();
        
            // Extract the public key in PEM format
            const pubKeyPem = keypair.getPublic('pem');
        
            // Create a new certification request (CSR) using Forge
            const csr = forge.pki.createCertificationRequest();
        
            // Set the public key in the CSR
            const publicKey = forge.pki.publicKeyFromPem(pubKeyPem);
            csr.publicKey = publicKey;
        
            // Set the X.509 subject fields for the CSR
            csr.setSubject([
                {
                    name: 'commonName',    // CN
                    value: 'TST-886431145-399999999900003',
                },
                {
                    name: 'countryName',    // C
                    value: 'SA',
                },
                {
                    name: 'organizationName', // O (Organization Name)
                    value: 'Qitaf Family Company LTD',
                },
                {
                    shortName: 'OU',        // OU (Organizational Unit)
                    value: '3550123433',
                }
            ]);
        
            // Set the attributes/extensions with valid OIDs
            csr.setAttributes([
                {
                    name: 'extensionRequest',
                    extensions: [
                        {
                            name: 'subjectAltName',
                            altNames: [
                                { type: 2, value: 'qitafsgroup.com' },  // DNS Name
                                { type: 1, value: 'ammar.ali@qitafsgroup.com' },  // Email Address
                            ],
                        },
                        // Organization Identifier (VAT)
                        {
                            id: '2.5.4.97',  // Custom OID for VAT Number
                            value: '310209740700003',
                        },
                        // Industry Business Category
                        {
                            id: '2.5.4.15',  // OID for Business Category
                            value: 'Food and Wholesale',
                        }
                    ],
                },
            ]);
        
            // Extract the elliptic private key in PEM format
            const privKeyPem = keypair.getPrivate('pem');
        
            // Sign the CSR using the elliptic private key
            const privateKey = forge.pki.privateKeyFromPem(privKeyPem);
            csr.sign(privateKey);
        
            // Convert CSR to PEM format
            const pemCsr = forge.pki.certificationRequestToPem(csr);
        
            // Define file paths to save in the D:/certificates/ directory
            const directoryPath = 'D:/certificates/';
            
            if (!fs.existsSync(directoryPath)) {
                fs.mkdirSync(directoryPath, { recursive: true });
            }
        
            const csrFilePath = path.join(directoryPath, 'generated_ec_csr.pem');
            const privateKeyFilePath = path.join(directoryPath, 'ec_private_key.key');
        
            try {
                // Save CSR and private key to files
                fs.writeFileSync(csrFilePath, pemCsr);
                fs.writeFileSync(privateKeyFilePath, privKeyPem);
                console.log(`CSR saved to ${csrFilePath}`);
                console.log(`Private key saved to ${privateKeyFilePath}`);
            } catch (error) {
                console.error('Error saving CSR or private key:', error);
            }
        
            // Return CSR and key information
            return {
                privateKey: privKeyPem,
                csr: pemCsr,
                csrFilePath,
                privateKeyFilePath
            };
        }
        
      
      
          // Step 1: Generate XML from invoice data
          async generateInvoiceXml(InvoiceData: any, invoiceHashBase64:any): Promise<string> {
            const privateKeyPem = process.env.EC_PRIVATE_KEY; 
            const date = InvoiceData.DocDate; 
            const time = InvoiceData.CreateTS; 
            const isoDateTime = `${date}T${time}Z`; 
            const doc = create({ version: '1.0', encoding: 'UTF-8' })
              .ele('Invoice', {
                xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
                'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
                'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
                'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
                'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',  // Namespace for digital signature elements
                'xmlns:xades': 'http://uri.etsi.org/01903/v1.3.2#'  // Namespace for XAdES elements
              })
             
              // Invoice information
              .ele('cbc:ProfileID').txt('reporting:1.0').up()
              .ele('cbc:ID').txt(InvoiceData.docentry).up()
              .ele('cbc:UUID').txt(InvoiceData.DocNum).up()
              .ele('cbc:IssueDate').txt(InvoiceData.DocDate).up()
              .ele('cbc:IssueTime').txt(InvoiceData.CreateTS).up()
              .ele('cbc:InvoiceTypeCode', { name: '0200000' }).txt('388').up()
              .ele('cbc:Note', { languageID: 'ar' }).txt('ABC').up()
              .ele('cbc:DocumentCurrencyCode').txt('SAR').up()
              .ele('cbc:TaxCurrencyCode').txt('SAR').up()
              // Additional Document References
              .ele('cac:AdditionalDocumentReference')
              .ele('cbc:ID').txt('ICV').up()
              .ele('cbc:UUID').txt('10').up()
              .up()
              .ele('cac:AdditionalDocumentReference')
              .ele('cbc:ID').txt('PIH').up()
              .ele('cac:Attachment')
              .ele('cbc:EmbeddedDocumentBinaryObject', { mimeCode: 'text/plain' }).txt(InvoiceData.pih) // Placeholder text for now
              .up()
              .up()
              .up()
              // Seller information
              .ele('cac:AccountingSupplierParty')
              .ele('cac:Party')
              .ele('cac:PartyIdentification')
              .ele('cbc:ID', { schemeID: 'CRN' }).txt(InvoiceData.VATNo).up()
              .up()
              .ele('cac:PostalAddress')
              .ele('cbc:StreetName').txt(InvoiceData.StreetName).up()
              .ele('cbc:BuildingNumber').txt(InvoiceData.Buildingno).up()
              .ele('cbc:CitySubdivisionName').txt(InvoiceData.citySubdivisionName).up()
              .ele('cbc:CityName').txt(InvoiceData.CityName).up()
              .ele('cbc:PostalZone').txt(InvoiceData.Zipcode).up()
              .ele('cac:Country')
              .ele('cbc:IdentificationCode').txt('SA').up()
              .up()
              .up()
              .ele('cac:PartyTaxScheme')
              .ele('cbc:CompanyID').txt(InvoiceData.VATNo).up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
              .up()
              .up()
              .ele('cac:PartyLegalEntity')
              .ele('cbc:RegistrationName').txt(InvoiceData.CompanyName).up()
              .up()
              .up()
              .up()
              // Buyer information
              .ele('cac:AccountingCustomerParty')
              .ele('cac:Party')
              .ele('cac:PostalAddress')
              .ele('cbc:StreetName').txt(InvoiceData.Street).up()
              .ele('cbc:BuildingNumber').txt(InvoiceData.BUILDING).up()
              .ele('cbc:CitySubdivisionName').txt(InvoiceData.CitySubdivisionName).up()
              .ele('cbc:CityName').txt(InvoiceData.City).up()
              .ele('cbc:PostalZone').txt(InvoiceData.ZipCode).up()
              .ele('cac:Country')
              .ele('cbc:IdentificationCode').txt('SA').up()
              .up()
              .up()
              .ele('cac:PartyTaxScheme')
              .ele('cbc:CompanyID').txt(InvoiceData.LicTradNum).up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
              .up()
              .up()
              .ele('cac:PartyLegalEntity')
              .ele('cbc:RegistrationName').txt(InvoiceData.CityName).up()
              .up()
              .up()
              .up()
              // Payment Means
              .ele('cac:PaymentMeans')
              .ele('cbc:PaymentMeansCode').txt('10').up()
              .up()
              // Allowance Charge
              .ele('cac:AllowanceCharge')
              .ele('cbc:ChargeIndicator').txt('false').up()
              .ele('cbc:AllowanceChargeReason').txt('discount').up()
              .ele('cbc:Amount', { currencyID: 'SAR' }).txt('0.00').up()
              .ele('cac:TaxCategory')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('S').up()
              .ele('cbc:Percent').txt('15').up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('VAT').up()
              .up()
              .up()
              .ele('cac:TaxCategory')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('S').up()
              .ele('cbc:Percent').txt('15').up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('VAT').up()
              .up()
              .up()
              .up()
              // Tax Total
              .ele('cac:TaxTotal')
              .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(InvoiceData.TaxSubTotal).up()
              .up()
              .ele('cac:TaxTotal')
              .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(InvoiceData.TaxSubTotal).up()
              .ele('cac:TaxSubtotal')
              .ele('cbc:TaxableAmount', { currencyID: 'SAR' }).txt(InvoiceData.TotalExclusiveAmt).up()
              .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(InvoiceData.TaxSubTotal).up()
              .ele('cac:TaxCategory')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('S').up()
              .ele('cbc:Percent').txt('15.00').up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID', { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' }).txt('VAT').up()
              .up()
              .up()
              .up()
              .up()
              // Legal Monetary Total
              .ele('cac:LegalMonetaryTotal')
              .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(InvoiceData.TotalExclusiveAmt).up()
              .ele('cbc:TaxExclusiveAmount', { currencyID: 'SAR' }).txt(InvoiceData.TotalExclusiveAmt).up()
              .ele('cbc:TaxInclusiveAmount', { currencyID: 'SAR' }).txt(InvoiceData.PayableAmount).up()
              .ele('cbc:AllowanceTotalAmount', { currencyID: 'SAR' }).txt('0.00').up()
              .ele('cbc:PrepaidAmount', { currencyID: 'SAR' }).txt('0.00').up()
              .ele('cbc:PayableAmount', { currencyID: 'SAR' }).txt(InvoiceData.PayableAmount).up()
              .up()
              // Invoice Lines
              .ele('cac:InvoiceLine')
              .ele('cbc:ID').txt('1').up()
              .ele('cbc:InvoicedQuantity', { unitCode: InvoiceData.uomcode }).txt(InvoiceData.quantity).up()
              .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(InvoiceData.LineTotal).up()
              .ele('cac:TaxTotal')
              .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(InvoiceData.VatSum).up()
              .ele('cbc:RoundingAmount', { currencyID: 'SAR' }).txt(InvoiceData.totalwithTax).up()
              .up()
              .ele('cac:Item')
              .ele('cbc:Name').txt(InvoiceData.Description).up()
              .ele('cac:ClassifiedTaxCategory')
              .ele('cbc:ID').txt('S').up()
              .ele('cbc:Percent').txt('15.00').up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
              .up()
              .up()
              .up()
              .ele('cac:Price')
              .ele('cbc:PriceAmount', { currencyID: 'SAR' }).txt(InvoiceData.Price).up()
              .ele('cac:AllowanceCharge')
              .ele('cbc:ChargeIndicator').txt('true').up()
              .ele('cbc:AllowanceChargeReason').txt('discount').up()
              .ele('cbc:Amount', { currencyID: 'SAR' }).txt('0.00').up()
              .up()
              .up()
              .up()
              .ele('cac:InvoiceLine')
              .ele('cbc:ID').txt('1').up()
              .ele('cbc:InvoicedQuantity', { unitCode: InvoiceData.uomcode }).txt(InvoiceData.quantity).up()
              .ele('cbc:LineExtensionAmount', { currencyID: 'SAR' }).txt(InvoiceData.TotalExclusiveAmt).up()
              .ele('cac:TaxTotal')
              .ele('cbc:TaxAmount', { currencyID: 'SAR' }).txt(InvoiceData.TaxSubTotal).up()
              .ele('cbc:RoundingAmount', { currencyID: 'SAR' }).txt(InvoiceData.DocTotal).up()
              .up()
              .ele('cac:Item')
              .ele('cbc:Name').txt(InvoiceData.Description).up()
              .ele('cac:ClassifiedTaxCategory')
              .ele('cbc:ID').txt('S').up()
              .ele('cbc:Percent').txt('15.00').up()
              .ele('cac:TaxScheme')
              .ele('cbc:ID').txt('VAT').up()
              .up()
              .up()
              .up()
              .ele('cac:Price')
              .ele('cbc:PriceAmount', { currencyID: 'SAR' }).txt(InvoiceData.Price).up()
              .ele('cac:AllowanceCharge')
              .ele('cbc:ChargeIndicator').txt('true').up()
              .ele('cbc:AllowanceChargeReason').txt('discount').up()
              .ele('cbc:Amount', { currencyID: 'SAR' }).txt('0.00').up()
              .up()
              .up()
              .up()
        
              const xml = doc.end({ prettyPrint: true });
    
              // Define the file path
              const folderPath = path.join('D:', 'Invoices');
              const fileName = `Invoice_${InvoiceData.DocNum}.xml`; // Generate a unique file name based on the DocNum
              const filePath = path.join(folderPath, fileName);
          
              // Create directory if it doesn't exist
              if (!fs.existsSync(folderPath)) {
                  fs.mkdirSync(folderPath, { recursive: true });
              }
          
              // Write the XML to a file
              fs.writeFileSync(filePath, xml, 'utf8');
          
              // Return the file path for the next API call
              return filePath;
          }



        
        
          
          

          async convertXmlToBase64(xml: string): Promise<string> {
            const base64 = Buffer.from(xml, 'utf-8').toString('base64');
            return base64;
          }
      
          // Step 2: Generate SHA-256 Hash for the XML
          async generateSha256Hash(canonicalXml: string): Promise<string> {
            const hash = crypto.createHash('sha256');
            hash.update(canonicalXml, 'utf8');
            return hash.digest('hex');  // Hexadecimal hash
        }

        hexToBase64(hexString: string): string {
          const buffer = Buffer.from(hexString, 'hex');
          return buffer.toString('base64');
      }
        
        
      
          // Step 3: Sign the hash using the private key (PEM format)
         
      
          // Step 4: Submit the invoice to ZATCA API
          async submitInvoice(invoiceData: any, privateKeyPem: string, csid: string, xml:any, csr:any): Promise<any> {
              try {

                

                //const invoiceDataString = JSON.stringify(invoiceData);
                const invoiceHashHex = await this.generateSha256Hash(xml);

                const invoiceHashBase64 = this.hexToBase64(invoiceHashHex);
                // Step 1: Generate the QR code
                const qrCode = await this.createZatcaQRCode(invoiceData, this.generateECDSASignature, invoiceHashHex);
                console.log(qrCode);
                
                // Step 2: Generate XML with the QR code embedded
                const invoiceXml = await this.generateInvoiceXmlWithQR(xml, qrCode);
                console.log("helllllllllllllllloooooooo");
                
                console.log("invoiceXML",xml);
                
                // Step 3: Generate SHA-256 hash of the XML
                console.log(invoiceData);
                
                // Step 4: Sign the hash using the private key
          
                // Step 5: Get OAuth token from AuthService
          
                // Step 6: Submit the signed invoice with QR code to ZATCA
                const response = await axios.post(
                  'https://api.zatca.gov.sa/invoices/reporting/single',
                  {
                    invoiceHashBase64,
                    invoice: Buffer.from(invoiceXml).toString('base64'), // Encode the XML in Base64
                  },
                  {
                    headers: {
                      Authorization: `Bearer`, // OAuth token
                      'Content-Type': 'application/json',
                      'Accept-Version': 'V2',
                      'Accept-Language': 'EN', // Or 'AR' for Arabic
                      'device-serial-number': csid, // CSID as per ZATCA's API requirements
                    },
                  },
                );
          
                // Step 7: Process the response
                if (response.status === 200) {
                  return {
                    success: true,
                    data: response.data,
                    message: 'Invoice submitted successfully',
                  };
                } else {
                  return this.handleError(response);
                }
              } catch (error) {
                console.error('Error submitting invoice:', error.response?.data || error.message);
                return this.handleError(error.response);
              }
            }
          
            // Handle error responses
            private handleError(response: any) {
              if (response?.status === 400) {
                return {
                  success: false,
                  message: 'Bad request. Please check your input.',
                  details: response.data,
                };
              } else if (response?.status === 401) {
                return {
                  success: false,
                  message: 'Unauthorized. Please check your OAuth token or credentials.',
                };
              } else if (response?.status === 404) {
                return {
                  success: false,
                  message: 'API not found. Please check the endpoint URL.',
                };
              } else if (response?.status === 500) {
                return {
                  success: false,
                  message: 'Internal server error at ZATCA. Please try again later.',
                };
              } else {
                return {
                  success: false,
                  message: 'An unknown error occurred.',
                  details: response?.data || 'No response data available',
                };
              }
            }
            generatePublicKeyFromPrivateKey(privateKeyPem: string): string {
              try {
                  // Remove PEM formatting (headers and new lines)
                  const privateKey = privateKeyPem
                      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
                      .replace(/-----END PRIVATE KEY-----/g, '')
                      .replace(/\n/g, '')
                      .trim(); // Ensure there's no leading or trailing whitespace
          
                  // Create ECDH object and set the private key
                  const ecdh = crypto.createECDH('prime256v1'); // Use 'secp256k1' if required
                  ecdh.setPrivateKey(privateKey, 'base64'); // Use 'base64' since the key is in base64 format
          
                  // Get the public key in compressed format
                  const publicKeyBuffer = ecdh.getPublicKey(null, 'compressed'); // Use 'compressed' for the public key
                  const publicKey = publicKeyBuffer.toString('base64'); // Convert the buffer to a base64 string
          
                  console.log('Generated Public Key:', publicKey);
                  return publicKey; // Return the public key as a raw string without PEM tags
              } catch (error) {
                  console.error('Error generating public key:', error);
                  throw new Error('Public key generation failed');
              }
          }

            async generateECDSASignature(invoiceData, privateKey) {
              try {
                  // Step 1: Hash the invoice data (you can use a JSON string or a part of the invoice)
                  const invoiceString = JSON.stringify(invoiceData);
                  const hash = crypto.createHash('sha256').update(invoiceString).digest();
          
                  // Step 2: Sign the hash using the private key
                  const sign = crypto.createSign('SHA256');
                  sign.update(hash);
                  sign.end();
          
                  // Step 3: Generate the ECDSA signature (DER-encoded by default)
                  const signature = sign.sign(privateKey, 'base64');
          
                  console.log('ECDSA Signature:', signature);
                  return signature;
              } catch (error) {
                  console.error('Error generating ECDSA signature:', error);
                  throw new Error('Signature generation failed');
              }
          }
      
          // Step 1: Generate Invoice XML with Base64 QR Code embedded
async generateInvoiceXmlWithQR(invoiceData: any, qrCode: string): Promise<string> {
  invoiceData.QRCode = qrCode; // This is the TLV base64 string
  const builder = new xml2js.Builder();
  const xml = builder.buildObject(invoiceData);

  console.log("Inside generateInvoiceXmlWithQR, XML is:", xml);

  return xml; // Return the XML with the embedded Base64 QR code
}

// Step 1: Generate ZATCA QR Data (TLV encoding)
generateZatcaQRData(invoiceData: any, ECDSA: string, publicKey: string): string {
  const sellerName = this.encodeTLV(1, (invoiceData.CompanyName || '').slice(0, 50));
  const vatNumber = this.encodeTLV(2, (invoiceData.VATNo?.toString() || '').slice(0, 15));
  const invoiceDate = this.encodeTLV(3, `${invoiceData.DocDate || ''}T${invoiceData.CreateTS || ''}`);
  const totalWithVAT = this.encodeTLV(4, Math.round(Number(invoiceData.DocTotal || 0)).toString());
  const vatAmount = this.encodeTLV(5, Math.round(Number(invoiceData.VatSum || 0)).toString());
  const generatedECDSA = this.encodeTLV(6, ECDSA);
  const publicKeyTLV = this.encodeTLV(8, publicKey); // Add the public key as the 8th field

  // Combine all TLV fields in hex
  const combinedHex = sellerName + vatNumber + invoiceDate + totalWithVAT + vatAmount + generatedECDSA  + publicKeyTLV;
  console.log('Combined Hex String:', combinedHex);

  // Convert the combined hex string to base64 once
  const base64Data = Buffer.from(combinedHex, 'hex').toString('base64');
  console.log('Base64 Encoded QR Data:', base64Data);

  return base64Data; // Return TLV data in base64
}

// Step 2: TLV Encode with Hexadecimal Conversion
encodeTLV(tag: number, value: string): string {
  if (!value) {
      throw new Error(`Value for tag ${tag} is undefined or null`);
  }

  // Convert tag and length to hexadecimal
  const tagHex = tag.toString(16).padStart(2, '0'); // Convert tag to 2-digit hex
  const lengthHex = Buffer.byteLength(value, 'utf8').toString(16).padStart(2, '0'); // Get byte length in hex
  const valueHex = Buffer.from(value, 'utf8').toString('hex'); // Value in hex

  // Combine all hex parts
  const tlvHex = tagHex + lengthHex + valueHex;
  console.log(`TLV Hex for tag ${tag}:`, tlvHex);

  return tlvHex; // Return TLV as hex string
}

// Step 5: Generate QR code (TLV data is in base64)
async generateQRCode(tlvData: string): Promise<string> {
  try {
      // TLV data is already in base64, just return it
      return tlvData;
  } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('QR code generation failed');
  }
}

// Step 5: Validate QR Data Length (limit to 1000 characters)
validateQRDataLength(tlvData: string): void {
  if (!tlvData) {
      throw new Error('TLV data is undefined or null');
  }
  if (tlvData.length > 1000) {
      throw new Error(`QR data exceeds 1000 character limit: ${tlvData.length} characters`);
  }
}

// Main Functions

// Generates ZATCA QR Code with all the fields and validates the size
async createZatcaQRCode(invoiceData: any, ECDSA: any, publicKey: any): Promise<string> {
  const tlvData = this.generateZatcaQRData(invoiceData, ECDSA, publicKey);
  this.validateQRDataLength(tlvData); // Ensure the TLV doesn't exceed 1000 characters
  
  const qrCode = await this.generateQRCode(tlvData); // Get base64-encoded QR code (TLV)
  return qrCode; // Return base64 string (not an image)
}

// This is the main method to generate QR Code for the invoice
async generateInvoiceQRCode(invoiceData: any, invoiceHash: any): Promise<string> {
  try {
      const qrCode = await this.createZatcaQRCode(invoiceData, this.generateECDSASignature, invoiceHash);
      return qrCode; // QR Code in base64
  } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
  }
}

generateCertificateHash(invoiceData: any): string {
  // Step 1: Extract the certificate (CSR) from invoiceData
  const csr = invoiceData.csr;
  if (!csr) {
    throw new Error("CSR (Certificate) is not provided in invoice data.");
  }

  // Step 2: Hash the certificate (CSR) using SHA-256
  const sha256Hash = crypto.createHash('sha256').update(csr).digest();

  // Step 3: Encode the hashed certificate using base64
  const base64EncodedHash = sha256Hash.toString('base64');

  // Output the base64 encoded certificate hash
  console.log('Base64 Encoded Certificate Hash:', base64EncodedHash);

  // Return the result
  return base64EncodedHash;
}


            
      
          async submitReport(invoiceData: any) {
            try {
                // const uuid = invoiceData?.uuid;
                // const invoiceDataString = JSON.stringify(invoiceData);
        
                // Generate SHA-256 hash of the invoice data
                



                //const invoiceDataString = JSON.stringify(invoiceData);
              

        
                // Read the private key from the file system (PEM format)
                const privateKeyPem = fs.readFileSync('D:/Certificates/private_key.pem', 'utf8');
        
                // Create a PrivateKey object
                const privateKey = crypto.createPrivateKey({
                    key: privateKeyPem,
                    format: 'pem',
                    type: 'pkcs8', // or 'sec1' if it's in SEC1 format
                });
        
                // Export the private key to base64 if necessary
                // const privateKeyBase64 = Buffer.from(privateKeyPem).toString('base64');
        
                // Generate ECDSA signature
                const ECDSA = await this.generateECDSASignature(invoiceData, privateKeyPem);
        
                // Generate the public key from the private key
                const publicKeyObject = crypto.createPublicKey(privateKey);
        
                // Convert the publicKeyObject into a PEM-encoded string
                const publicKeyPem = publicKeyObject.export({ type: 'spki', format: 'pem' });
        
                // Step 1: Generate the QR code
                const qrCode = await this.createZatcaQRCode(invoiceData, ECDSA, publicKeyPem);
        
                // const base64CertificateHash = this.generateCertificateHash(invoiceData);
                // Log the generated hash
        
                // Step 4: Sign the hash using the private key
        
                const xml = await this.generateInvoiceXml(invoiceData, qrCode);
        
                // Log the generated XML
                console.log("Generated Invoice XML:", xml);
        
                // Step 3: Convert the invoice XML to Base64
                const invoiceXmlBase64 = Buffer.from(xml).toString('base64');
        
                // Log the Base64 encoded XML
                console.log("Invoice XML in Base64:", invoiceXmlBase64);
        
                // Log the signed invoice
        
                    // Authorization credentials from previous API call
                    // const compliancerequestid = 1234567890123;
                    // const binarySecurityToken = 'TUlJQ2FqQ0NBZytnQXdJQkFnSUdBWkl6Wlc3ek1Bb0dDQ3FHU000OUJBTUNNQlV4RXpBUkJnTlZCQU1NQ21WSmJuWnZhV05wYm1jd0hoY05NalF3T1RJM01USXhNakV6V2hjTk1qa3dPVEkyTWpFd01EQXdXakJ1TVFzd0NRWURWUVFHRXdKVFFURVRNQkVHQTFVRUN3d0tNelUxTURFeU16UXpNekVoTUI4R0ExVUVDZ3dZVVdsMFlXWWdSbUZ0YVd4NUlFTnZiWEJoYm5rZ1RGUkVNU2N3SlFZRFZRUUREQjVVVTFRdE16VTFNREV5TXpRek15MHpNVEF5TURrM05EQTNNREF3TURNd1ZqQVFCZ2NxaGtqT1BRSUJCZ1VyZ1FRQUNnTkNBQVNHQWpub1k3ZkRIaFA2MTcwc2RSc05PalJWQjQ2dGh2VVQvSkJ4U2E4SFVOSEdQb1ZwZm1rc0lCcWRmOXJqMzQra3UxWnNET215di9MeVYrQlo1UlgxbzRIME1JSHhNQXdHQTFVZEV3RUIvd1FDTUFBd2dlQUdBMVVkRVFTQjJEQ0IxYVNCMGpDQnp6RTdNRGtHQTFVRUJBd3lNUzFVVTFSOE1pMVVVMVI4TXkxbFpESXlaakZrT0MxbE5tRXlMVEV4TVRndE9XSTFPQzFrT1dFNFpqRXhaVFEwTldZeEh6QWRCZ29Ka2lhSmsvSXNaQUVCREE4ek1UQXlNRGszTkRBM01EQXdNRE14RFRBTEJnTlZCQXdNQkRBeE1EQXhRekJCQmdOVkJCb01PalkyTWpBZ1RYVnBiaUJKWW00Z1dtRnBaR0ZvSURJMk5UTWdRV3hoZW1sNmFYbGhhQ0JCYkhGaFpHbHRZV2dnVkdGaWRXc2dORGM1TVRJeEd6QVpCZ05WQkE4TUVrWnZiMlFnWVc1a0lGZG9iMnhsYzJGc1pUQUtCZ2dxaGtqT1BRUURBZ05KQURCR0FpRUF2T0RXcXB1L3Vkc2grQWFYeEZNaUNXanBBUUVjbFBPNWdFL2d6SjUxUGRvQ0lRRDJvVHFpQlVjb01QVkhYQXVmdHBEN0ZoSkx5cXlqMkJJOHlBeFVqeGlaMXc9PQ=='; // shortened
                    // const secret = 'BiO0T1YMoE3VT/R/JFrXaI76QXktBCNrJfgsvkoCZdU=';
                    // const credentials = Buffer.from(`${binarySecurityToken}:${secret}`);
                    // console.log('credentials',credentials);
                    
                    // const authorizationHeader = `Basic ${credentials}`;
                    // console.log(`Authorization Header: ${authorizationHeader}`);
                    // const payload = {
                    //     uuid: uuid,
                    //     invoiceHash: invoiceXmlBase64,
                    //     invoice: invoiceXmlBase64,
                    // };
        
                    // // Make the request to the reporting API
                    // console.log("Payload being sent to ZATCA API:", payload);
                    // const response = await axios.post(
                    //     this.reportingApiUrl,
                    //     payload,
                    //     {
                    //         headers: {
                    //             'Authorization': authorizationHeader,  // Basic Auth or Bearer Token
                    //             'accept-language': 'en',               // Ensure language is set
                    //             'Clearance-Status': '0',               // Clearance status, ensure this is correct
                    //             'Accept-Version': 'V2',                // API version
                    //             'Content-Type': 'application/json',    // Payload is JSON
                    //         },
                    //     },
                    // );
        
                    // Log the successful response
        
                    return xml;
        
                } catch (error) {
                    console.error('Error submitting report:', error.message);
                    throw new Error('Failed to submit report');
                }
            }
          //   async getPcsId(complianceRequestId: string) {
          //     if (!complianceRequestId ) {
          //         throw new Error('Missing required parameters.');
          //     }

              
          //           const binarySecurityToken = 'TUlJQ2FqQ0NBZytnQXdJQkFnSUdBWkl6Wlc3ek1Bb0dDQ3FHU000OUJBTUNNQlV4RXpBUkJnTlZCQU1NQ21WSmJuWnZhV05wYm1jd0hoY05NalF3T1RJM01USXhNakV6V2hjTk1qa3dPVEkyTWpFd01EQXdXakJ1TVFzd0NRWURWUVFHRXdKVFFURVRNQkVHQTFVRUN3d0tNelUxTURFeU16UXpNekVoTUI4R0ExVUVDZ3dZVVdsMFlXWWdSbUZ0YVd4NUlFTnZiWEJoYm5rZ1RGUkVNU2N3SlFZRFZRUUREQjVVVTFRdE16VTFNREV5TXpRek15MHpNVEF5TURrM05EQTNNREF3TURNd1ZqQVFCZ2NxaGtqT1BRSUJCZ1VyZ1FRQUNnTkNBQVNHQWpub1k3ZkRIaFA2MTcwc2RSc05PalJWQjQ2dGh2VVQvSkJ4U2E4SFVOSEdQb1ZwZm1rc0lCcWRmOXJqMzQra3UxWnNET215di9MeVYrQlo1UlgxbzRIME1JSHhNQXdHQTFVZEV3RUIvd1FDTUFBd2dlQUdBMVVkRVFTQjJEQ0IxYVNCMGpDQnp6RTdNRGtHQTFVRUJBd3lNUzFVVTFSOE1pMVVVMVI4TXkxbFpESXlaakZrT0MxbE5tRXlMVEV4TVRndE9XSTFPQzFrT1dFNFpqRXhaVFEwTldZeEh6QWRCZ29Ka2lhSmsvSXNaQUVCREE4ek1UQXlNRGszTkRBM01EQXdNRE14RFRBTEJnTlZCQXdNQkRBeE1EQXhRekJCQmdOVkJCb01PalkyTWpBZ1RYVnBiaUJKWW00Z1dtRnBaR0ZvSURJMk5UTWdRV3hoZW1sNmFYbGhhQ0JCYkhGaFpHbHRZV2dnVkdGaWRXc2dORGM1TVRJeEd6QVpCZ05WQkE4TUVrWnZiMlFnWVc1a0lGZG9iMnhsYzJGc1pUQUtCZ2dxaGtqT1BRUURBZ05KQURCR0FpRUF2T0RXcXB1L3Vkc2grQWFYeEZNaUNXanBBUUVjbFBPNWdFL2d6SjUxUGRvQ0lRRDJvVHFpQlVjb01QVkhYQXVmdHBEN0ZoSkx5cXlqMkJJOHlBeFVqeGlaMXc9PQ=='; // shortened
          //           const secret = 'BiO0T1YMoE3VT/R/JFrXaI76QXktBCNrJfgsvkoCZdU=';
          //           const credentials = (`${binarySecurityToken}${secret}`);
          //           console.log('credentials',credentials);
                    
          //           const authorizationHeader = `Basic ${credentials}`;
      
          //     const headers = {
          //         'Content-Type': 'application/json',
          //         'Authorization': authorizationHeader, // Bearer token for authentication
          //         'Accept-Version': 'V2',  // Add your secret in headers
          //     };
      
          //     const body = { complianceRequestId };
      
          //     console.log('Fetching PCS ID with body:', body); // Log the request body for debugging
      
          //     try {
          //         const response = await axios.post(this.zatcaUrll, body, { headers });
          //         console.log('PCS ID retrieved successfully. Response:', response.data);
          //         return response.data; // Return the API response data
          //     } catch (error) {
          //         console.error('Error retrieving PCS ID:', error.response?.data || error.message);
          //         throw new Error('Failed to retrieve PCS ID');
          //     }
          // }
          }
// async generateInvoiceJson() {
//     try {
//       const query = `
//             SELECT T0.[DocNum], T0.[DocDate], T0.[CreateTS], T2.RegNum, T2.[LicTradNum],
//             T3.[Street], T3.[Block], T3.BUILDING, T3.STREETNO, T3.[City], T3.[ZipCode],
//             T2.[CardName], t1.VatSum, t0.VatSum as "Tax SubTotal", T0.[DocTotal] / 1.15 as "Total Without Tax",
//             T0.[DocTotal] / 1.15 as "Total Exclusive Amt", T0.[DocTotal], T0.[DocTotal] as "Payable Amount",
//             t1.quantity, t1.uomcode, T1.LineTotal, t1.vatsum, t1.GTotal as "total with Tax", t1.Dscription, T1.Price
//             FROM OINV T0
//             INNER JOIN INV1 T1 ON T0.[DocEntry] = T1.[DocEntry]
//             INNER JOIN OCRD T2 ON T0.[CardCode] = T2.[CardCode]
//             INNER JOIN CRD1 T3 ON T2.[CardCode] = T3.[CardCode];
//         `;

//       console.log('Executing query...');
//       const result = await this.connection.query(query);
//       console.log('Query executed successfully.');

//       const groupedByDate = result.reduce((acc, current) => {
//         let docDate: Date;

//         console.log(`Original DocDate value: ${current.DocDate}`);

//         if (typeof current.DocDate === 'string') {
//           docDate = new Date(current.DocDate);
//         } else if (current.DocDate instanceof Date) {
//           docDate = current.DocDate;
//         } else {
//           console.error('Unexpected date format');
//           throw new Error('Unexpected date format');
//         }

//         console.log(`Date object before adjustment: ${docDate.toISOString()}`);

//         // Adjust the date by adding 1 day
//         docDate = addDays(docDate, 1);

//         console.log(`Date object after adjustment: ${docDate.toISOString()}`);

//         // Update the DocDate in the current object
//         current.DocDate = docDate.toISOString();

//         console.log(`Updated DocDate value: ${current.DocDate}`);

//         const docDateString = docDate.toISOString().split('T')[0];

//         console.log(`Formatted DocDate string: ${docDateString}`);

//         current.status = 'Imported';

//         if (!acc[docDateString]) {
//           acc[docDateString] = [];
//         }
//         acc[docDateString].push(current);
//         return acc;
//       }, {});

//       const outputDir = path.join(__dirname, '../../../zatcaData');
//       if (!fs.existsSync(outputDir)) {
//         fs.mkdirSync(outputDir, { recursive: true });
//       }


//       for (const [date, data] of Object.entries(groupedByDate)) {
//         const filePath = path.join(outputDir, `invoices_${date}.json`);
//         console.log(`Creating file: ${filePath} for date: ${date}`);
//         fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
//       }

//       return { message: 'JSON files generated successfully' };
//     } catch (error) {
//       console.error('Error generating JSON files:', error);
//       throw new Error('Failed to generate JSON files');
//     }
//   }


//   async generateInvoiceJsonForDate(date: string) {
//     try {
//       // Validate and format the provided date
//       const formattedDate = moment(date, 'YYYY-MM-DD', true).format('YYYY-MM-DD');

//       if (!moment(formattedDate, 'YYYY-MM-DD', true).isValid()) {
//         throw new Error('Invalid date format. Please use YYYY-MM-DD.');
//       }

//       // SQL query to get data for the specified date
//       const query = `
//       SELECT T0.[DocNum], T0.[DocDate], T0.[CreateTS], T2.RegNum, T2.[LicTradNum],
//       T3.[Street], T3.[Block], T3.BUILDING, T3.STREETNO, T3.[City], T3.[ZipCode],
//       T2.[CardName], t1.VatSum, t0.VatSum as "Tax SubTotal", T0.[DocTotal] / 1.15 as "Total Without Tax",
//       T0.[DocTotal] / 1.15 as "Total Exclusive Amt", T0.[DocTotal], T0.[DocTotal] as "Payable Amount",
//       t1.quantity, t1.uomcode, T1.LineTotal, t1.vatsum, t1.GTotal as "Total with Tax", t1.Dscription, T1.Price
//       FROM OINV T0
//       INNER JOIN INV1 T1 ON T0.[DocEntry] = T1.[DocEntry]
//       INNER JOIN OCRD T2 ON T0.[CardCode] = T2.[CardCode]
//       INNER JOIN CRD1 T3 ON T2.[CardCode] = T3.[CardCode]
//       WHERE CAST(T0.[DocDate] AS DATE) = '${formattedDate}';
//     `;

//       const result: InvoiceData[] = await this.connection.query(query);

//       // If no data is returned, log a message and return
//       if (result.length === 0) {
//         console.log(`No invoices found for ${formattedDate}`);
//         return { message: 'No data found for the specified date' };
//       }

//       // Ensure the directory exists
//       const outputDir = path.join(__dirname, '../../../');
//       if (!fs.existsSync(outputDir)) {
//         fs.mkdirSync(outputDir, { recursive: true });
//       }

//       // File path for the specified date's data
//       const filePath = path.join(outputDir, `invoices_${formattedDate}.json`);

//       // Log the creation of the file
//       console.log(`Creating file: ${filePath} for date: ${formattedDate}`);

//       // Ensure each record in data uses the correct DocDate
//       const updatedData = result.map(record => {
//         return {
//           ...record,
//           DocDate: formattedDate,
//           Status: 'Imported'
//         };
//       });

//       // Write data to JSON file
//       fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));

//       return { message: 'JSON file for the specified date generated successfully', data: updatedData };
//     } catch (error) {
//       console.error('Error generating JSON file for the specified date:', error);
//       throw new Error('Failed to generate JSON file for the specified date');
//     }
//   }






//controle file 
  // @Get()
  // async getInvoices() {
  //   await this.invoiceService.generateInvoiceJson();
  //   return { message: 'Invoices have been processed and written to files.' };
  // }

  // @Get('generateInvoiceJsonForToday/:date')
  // async getInvoicesOnCurrentDate(
  //   @Param('date') date: string
  // ) {
  //   const getData = await this.invoiceService.generateInvoiceJsonForDate(date);
  //   return getData;
  // }
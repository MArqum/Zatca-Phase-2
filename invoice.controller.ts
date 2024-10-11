import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import * as fs from 'fs';
import * as path from 'path';
import { response } from 'express';

@Controller('invoices')
export class InvoiceController {

  constructor(private readonly invoiceService: InvoiceService ) {}


    @Get('generateAll')
    async getInvoices() {
      await this.invoiceService.generateInvoiceJson();
      return { message: 'Invoices have been processed and written to files.' };
    }
  
    @Get('generateInvoiceJsonForToday/:date')
    async getInvoicesOnCurrentDate(@Param('date') date: string) {
      try {
          const getData = await this.invoiceService.generateInvoiceJsonForDate(date);
  
          // Assuming the data is saved as JSON
          const filePath = path.join(__dirname, '../../../', `invoices_${date}.json`);
          const jsonData = fs.readFileSync(filePath, 'utf8');
          const invoiceObjects = JSON.parse(jsonData); // Array of objects
  
          // Collect responses from each submitReport call
          const allResponses = [];
  
          // Iterate over each object and call submitReport
          for (const invoice of invoiceObjects) {
              console.log('Submitting invoice:', invoice);
  
              // Call the submitReport method with each invoice object and store the response
              const response = await this.submitReport(invoice);
              console.log('Report response:', response);
  
              // Push the response to the array
              allResponses.push(response);
          }
  
          // Return the collected responses after processing all invoices
          return { message: 'All invoices processed', responses: allResponses };
      } catch (error) {
          console.log(error);
          return { message: 'Error processing invoices', error: error.message };
      }
  }
  


  // Submit the CSR to ZATCA along with OTP
  // Submit the CSR to ZATCA along with OTP




    @Post('submit-report')
    async submitReport(@Body() invoiceData: any): Promise<any> {
        try {
            console.log('Submitting report...');
            const finalInvoice = await invoiceData;
            const response = await this.invoiceService.submitReport(invoiceData);
            console.log('Report submitted successfully:', response, finalInvoice);
    
            // Assuming response contains the necessary path for the next process
            const processResponse = await this.processInvoice({ reportResponse: response }); // Call processInvoice with reportResponse
            
            return {processRes: processResponse, invoices: finalInvoice}; // Return the result of processInvoice
        } catch (error) {
            const err = error as Error; // Cast to Error type
            return { error: err.message };
        }
    }
    


    @Post('process')
    async processInvoice(@Body() body: { reportResponse: string }): Promise<any> {
        try {
            const { reportResponse } = body;
    
            const previousHash = this.invoiceService.getPreviousInvoiceHash();
            const invoiceWithPih = this.addPreviousHashToInvoice(reportResponse, previousHash);
            const { validationResponse, invoiceHash, signedXmlPath, qrCodeImagePath } = await this.invoiceService.processInvoice(invoiceWithPih);
    
            return {
                status: 'success',
                validationResponse,
                currentInvoiceHash: invoiceHash,
                previousInvoiceHash: previousHash,
                signedXmlPath: path.normalize(signedXmlPath), // Normalize the path for frontend
                qrCodeImagePath: path.normalize(qrCodeImagePath) // Normalize the QR code path as well
            };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    


  addPreviousHashToInvoice(xmlData: string, previousHash: string | null): string {
    if (!previousHash) {
      return xmlData; // No hash to insert
    }

    // Assuming you insert the hash into the XML at a known location (customize this as needed)
    const pihTag = `<PreviousInvoiceHash>${previousHash}</PreviousInvoiceHash>`;
    return xmlData.replace('</Invoice>', `${pihTag}</Invoice>`);
  }

  
}

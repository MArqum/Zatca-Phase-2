import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceModule } from './modules/invoice/invoice.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mssql',
      host: 'localhost',
      port: 1433,
      username: 'Zatca',
      password: 'nastecsol',
      database: 'ZATCA',
      synchronize: true,
      options: {
        encrypt: true,
      },
      extra: {
        trustServerCertificate: true,
      },
    }),
    
    InvoiceModule
  ],
})
export class AppModule {}

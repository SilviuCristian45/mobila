// Scrierea fișierului XLSX al bugetului. Modul încărcat la cerere (import dinamic din BudgetPanel), ca biblioteca să nu
// intre în pachetul inițial. Foile vin din domeniu (`budgetToSheets`); aici doar se scriu.
import writeXlsxFile from 'write-excel-file/browser';
import { budgetToSheets, type BudgetSummary, type ProjectDocument } from '@/domain';

export async function budgetXlsxBlob(doc: ProjectDocument, summary: BudgetSummary): Promise<Blob> {
  return writeXlsxFile(budgetToSheets(doc, summary)).toBlob();
}

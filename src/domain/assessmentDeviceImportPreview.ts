/** Assessment-only offline preview. Rules shared with the browser; never writes FACTACT state. */
export type DeviceField='asset_tag'|'display_name'|'serial_number';
export type RowOutcome='NEEDS_REVIEW'|'COMPARISON_PENDING'|'EXCLUDED';
export interface Mapping {sourceColumnIndex:number;targetField:DeviceField|null;origin:'EXACT'|'ALIAS'|'HUMAN';}
export interface ImportRow {sourceRowNumber:number;originalCells:string[];mappedCandidate:Partial<Record<DeviceField,string>>;issues:string[];outcome:RowOutcome;}
export interface ImportPreview {headers:string[];mapping:Mapping[];rows:ImportRow[];issues:string[];}
export interface SourceRecord {cells:string[];line:number;}
interface PreviewCore {
 parseCsvRecords(input:string):SourceRecord[];
 suggestMapping(headers:readonly string[]):Mapping[];
 previewRecords(records:SourceRecord[],mapping?:Mapping[]):ImportPreview;
 previewDeviceCsv(input:string,mapping?:Mapping[]):ImportPreview;
}
// A single pure implementation is used by the Node tests and the browser UI.
const core:PreviewCore=require('../../public/js/assessment-device-preview-core.js');
export const parseCsv=(input:string):string[][]=>core.parseCsvRecords(input).map(r=>r.cells);
export const suggestMapping=(headers:readonly string[]):Mapping[]=>core.suggestMapping(headers);
export const previewDeviceCsv=(input:string,humanMapping?:Mapping[]):ImportPreview=>core.previewDeviceCsv(input,humanMapping);
export const previewDeviceRecords=(records:SourceRecord[],humanMapping?:Mapping[]):ImportPreview=>core.previewRecords(records,humanMapping);

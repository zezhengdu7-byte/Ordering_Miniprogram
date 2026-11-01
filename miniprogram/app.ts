import { initialize } from './utils/store';
import { initAuth } from './utils/auth';
import { handleTableEntry } from './utils/table-service';
App({ onLaunch() { initialize(); initAuth(); }, onShow(options: any) { void handleTableEntry(options); } });

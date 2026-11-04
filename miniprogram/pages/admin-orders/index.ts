import { merchantPage } from '../../utils/auth';
import { orderPage } from '../../utils/order-page';
const page = orderPage(true);
page.data.filter = 'pending';
Page(merchantPage(page));

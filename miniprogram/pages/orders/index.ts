import { orderPage } from '../../utils/order-page';
const page = orderPage(false);
page.data.filters = [
  ...page.data.filters.filter(item => item.id === 'all'),
  ...page.data.filters.filter(item => item.id !== 'all')
];
Page(page);

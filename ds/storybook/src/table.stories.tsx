import {
    GlassBadge,
    GlassTable,
    GlassTableHeader,
    GlassTableRow,
    GlassTableHead,
    GlassTableBody,
    GlassTableCell,
    GlassTableCaption,
    GlassTableFooter,
} from '@picklehub/ui-web';
import { mockUsers } from './ein-mock-data';
export default { title: 'Data display/Table' };
export const Example1 = {
    name: 'Basic Table',
    render: () => (
        <GlassTable>
            <GlassTableHeader>
                <GlassTableRow>
                    <GlassTableHead className="w-25">Invoice</GlassTableHead>
                    <GlassTableHead>Status</GlassTableHead>
                    <GlassTableHead>Method</GlassTableHead>
                    <GlassTableHead className="text-right">Amount</GlassTableHead>
                </GlassTableRow>
            </GlassTableHeader>
            <GlassTableBody>
                <GlassTableRow>
                    <GlassTableCell className="font-medium">INV001</GlassTableCell>
                    <GlassTableCell>Paid</GlassTableCell>
                    <GlassTableCell>Credit Card</GlassTableCell>
                    <GlassTableCell className="text-right">$250.00</GlassTableCell>
                </GlassTableRow>
                <GlassTableRow>
                    <GlassTableCell className="font-medium">INV002</GlassTableCell>
                    <GlassTableCell>Pending</GlassTableCell>
                    <GlassTableCell>PayPal</GlassTableCell>
                    <GlassTableCell className="text-right">$150.00</GlassTableCell>
                </GlassTableRow>
            </GlassTableBody>
        </GlassTable>
    ),
};
export const Example2 = {
    name: 'Table with Footer',
    render: () => (
        <GlassTable>
            <GlassTableCaption>A list of your recent invoices.</GlassTableCaption>
            <GlassTableHeader>
                <GlassTableRow>
                    <GlassTableHead>Invoice</GlassTableHead>
                    <GlassTableHead>Status</GlassTableHead>
                    <GlassTableHead className="text-right">Amount</GlassTableHead>
                </GlassTableRow>
            </GlassTableHeader>
            <GlassTableBody>
                <GlassTableRow>
                    <GlassTableCell>INV001</GlassTableCell>
                    <GlassTableCell>Paid</GlassTableCell>
                    <GlassTableCell className="text-right">$250.00</GlassTableCell>
                </GlassTableRow>
                <GlassTableRow>
                    <GlassTableCell>INV002</GlassTableCell>
                    <GlassTableCell>Paid</GlassTableCell>
                    <GlassTableCell className="text-right">$150.00</GlassTableCell>
                </GlassTableRow>
            </GlassTableBody>
            <GlassTableFooter>
                <GlassTableRow>
                    <GlassTableCell colSpan={2}>Total</GlassTableCell>
                    <GlassTableCell className="text-right">$400.00</GlassTableCell>
                </GlassTableRow>
            </GlassTableFooter>
        </GlassTable>
    ),
};
export const Example3 = {
    name: 'Table with Buttons',
    render: () => (
        <GlassTable>
            <GlassTableHeader>
                <GlassTableRow>
                    <GlassTableHead>Name</GlassTableHead>
                    <GlassTableHead>Email</GlassTableHead>
                    <GlassTableHead>Role</GlassTableHead>
                    <GlassTableHead>Status</GlassTableHead>
                </GlassTableRow>
            </GlassTableHeader>
            <GlassTableBody>
                {mockUsers.map((user) => (
                    <GlassTableRow key={user.email}>
                        <GlassTableCell className="font-medium">{user.name}</GlassTableCell>
                        <GlassTableCell>{user.email}</GlassTableCell>
                        <GlassTableCell>
                            <GlassBadge variant="outline">{user.role}</GlassBadge>
                        </GlassTableCell>
                        <GlassTableCell>
                            <GlassBadge variant={user.status === 'Active' ? 'primary' : 'default'}>
                                {user.status}
                            </GlassBadge>
                        </GlassTableCell>
                    </GlassTableRow>
                ))}
            </GlassTableBody>
        </GlassTable>
    ),
};

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getDefaultVendorId } from '@/lib/actions';

export const metadata: Metadata = {
  title: 'Vendors',
};

export default async function VendorsPage() {
    const defaultVendorId = await getDefaultVendorId();
    if (defaultVendorId) {
        redirect(`/vendors/${defaultVendorId}`);
    }
    // Fallback for empty DB (e.g. same single-vendor ID as parent)
    redirect(`/vendors/cccccccc-cccc-cccc-cccc-cccccccccccc`);
}

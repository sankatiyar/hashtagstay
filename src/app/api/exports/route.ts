import { NextResponse } from 'next/server';

import { actorFor } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { type ExportKind, buildExport } from '@/lib/services/exports';
import { periodFromParams } from '@/lib/services/reports';

/** CSV exports for finance and management (FR-30). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.audience !== 'staff' || !can(user.roles, 'report:view')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') as ExportKind | null;
  if (!kind || !['leads', 'bookings', 'payments', 'invoices'].includes(kind)) {
    return NextResponse.json({ message: 'Unknown export' }, { status: 400 });
  }

  const wantsPii = url.searchParams.get('pii') === '1';
  if (wantsPii && !can(user.roles, 'export:pii')) {
    return NextResponse.json(
      { message: 'Exporting full contact details needs the export:pii permission.' },
      { status: 403 },
    );
  }

  const period = periodFromParams({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  const result = await buildExport(
    kind,
    period,
    { includePii: wantsPii },
    actorFor(user),
  );
  return new NextResponse(result.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

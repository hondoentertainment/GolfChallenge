import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserNotifications, getUnreadCount, markAsRead, markAllAsRead } from '@/lib/notifications';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [notifications, unreadCount] = await Promise.all([
      getUserNotifications(user.id),
      getUnreadCount(user.id),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// Mark as read
export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { notificationId, markAll } = await req.json();

    if (markAll) {
      await markAllAsRead(user.id);
    } else if (notificationId) {
      await markAsRead(notificationId, user.id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}

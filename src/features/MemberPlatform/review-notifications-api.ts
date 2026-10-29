import { memberSessionToken } from '../MemberCV/session';
import { isLocalMemberMode } from './local-mode';

export type DurableReviewNotification = { id: string; title: string; description: string; createdAt: string; href: '/finance/sponsor-reviews' | '/sponsor-pipeline'; variant: 'info' };
export interface ReviewNotificationsApi { list(): Promise<DurableReviewNotification[]>; markRead(ids: string[]): Promise<void> }
export function createReviewNotificationsApi(): ReviewNotificationsApi {
 const owner={current:null as string|null};
 async function request(body?: unknown) {
  const token=await memberSessionToken(owner);
  const response=await fetch(`/api/partner-deals${body?'':'?view=reviewNotifications'}`,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok) throw new Error('Could not update review notifications.');
  return await response.json();
 }
 return {
  async list() {
   if(isLocalMemberMode()) return [];
   const data:unknown=await request();
   if(!Array.isArray(data)) throw new Error('Could not load review notifications.');
   return data.filter((item):item is DurableReviewNotification=>Boolean(item && typeof item==='object' &&
     typeof item.id==='string' && /^[0-9a-f-]{36}$/i.test(item.id) && typeof item.title==='string' && typeof item.description==='string' &&
     typeof item.createdAt==='string' && !Number.isNaN(Date.parse(item.createdAt)) &&
     (item.href==='/finance/sponsor-reviews'||item.href==='/sponsor-pipeline') && item.variant==='info'));
  },
  async markRead(ids) { if(!isLocalMemberMode()) await request({action:'markReviewNotificationsRead',ids}); },
 };
}

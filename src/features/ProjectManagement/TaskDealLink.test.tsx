// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TaskDetailPage from './TaskDetail';
import { initialLocalWorkspace } from './local-repository';
import { MemberThemeProvider } from '../MemberPlatform/MemberTheme';
const deal='80000000-0000-4000-8000-000000000031';
let element:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);element=document.createElement('div');document.body.append(element);root=createRoot(element);});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();});
async function renderWith(lookup:()=>Promise<string|null>, allowed=true){
 const workspace=initialLocalWorkspace(); const task=workspace.tasks.find(t=>t.kind==='task')!;
 const repository={load:vi.fn().mockResolvedValue(allowed?workspace:{...workspace,tasks:[]}),mutate:vi.fn()};
 const router=createMemoryRouter([{path:'/tasks/:taskId',element:<MemberThemeProvider><TaskDetailPage repository={repository} loadPartnerDeal={lookup}/></MemberThemeProvider>}],{initialEntries:[`/tasks/${task.id}`]});
 await act(async()=>root.render(<RouterProvider router={router}/>));
 return task;
}
it('links an authorized task reader to the matching agreement',async()=>{
 const lookup=vi.fn().mockResolvedValue(deal); const task=await renderWith(lookup);
 expect(lookup).toHaveBeenCalledWith(task.id);
 expect(element.querySelector(`a[href="/partner-deals?deal=${deal}"]`)?.textContent).toBe('View partner agreement');
});
it('keeps task-only access intact without exposing a deal link',async()=>{
 const lookup=vi.fn().mockResolvedValue(null); const task=await renderWith(lookup);
 expect(element.textContent).toContain(task.title);
 expect(element.querySelector('a[href^="/partner-deals"]')).toBeNull();
});
it('does not request a deal link when the task itself is unavailable',async()=>{
 const lookup=vi.fn().mockResolvedValue(deal); await renderWith(lookup,false);
 expect(lookup).not.toHaveBeenCalled();
 expect(element.querySelector('a[href^="/partner-deals"]')).toBeNull();
});

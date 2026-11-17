import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { logAuditAction } from "./orgService";
import { Task, UserRole, TaskPriority, TaskStatus } from "../types";

/**
 * Fetch all tasks (optionally filtered by working group or assignee)
 */
export async function fetchTasks(filters?: {
  workingGroupId?: string;
  assigneeId?: string;
}): Promise<Task[]> {
  let q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

  if (filters?.workingGroupId) {
    q = query(collection(db, "tasks"), where("workingGroupId", "==", filters.workingGroupId), orderBy("createdAt", "desc"));
  } else if (filters?.assigneeId) {
    q = query(collection(db, "tasks"), where("assigneeId", "==", filters.assigneeId), orderBy("createdAt", "desc"));
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
}

/**
 * Create a new Task
 */
export async function createTask(
  data: {
    title: string;
    description: string;
    workingGroupId: string;
    subTeamId?: string | null;
    assigneeId: string;
    deadline: any;
    expectedOutput: string;
    priority: TaskPriority;
  },
  actor: { uid: string; role: UserRole }
): Promise<string> {
  const docRef = await addDoc(collection(db, "tasks"), {
    ...data,
    subTeamId: data.subTeamId || null,
    createdBy: actor.uid,
    status: "not_started" as TaskStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "CREATE_TASK",
    targetCollection: "tasks",
    targetId: docRef.id,
    metadata: { title: data.title, assigneeId: data.assigneeId },
  });

  return docRef.id;
}

/**
 * Update task status or details
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  actorId: string
) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    status,
    updatedAt: serverTimestamp(),
  });

  await logAuditAction({
    actorId,
    actorRole: "member",
    action: `UPDATE_TASK_STATUS_${status.toUpperCase()}`,
    targetCollection: "tasks",
    targetId: taskId,
  });
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string, actor: { uid: string; role: UserRole }) {
  await deleteDoc(doc(db, "tasks", taskId));

  await logAuditAction({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "DELETE_TASK",
    targetCollection: "tasks",
    targetId: taskId,
  });
}
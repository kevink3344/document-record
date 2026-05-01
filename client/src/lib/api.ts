const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) msg = payload.error;
    } catch {
      // no-op
    }
    throw new Error(msg);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

// Categories API
export interface Category {
  id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export async function getCategories(): Promise<Category[]> {
  const result = await apiRequest<Category[]>('/categories');
  return result ?? [];
}

export async function createCategory(data: { name: string; color?: string; description?: string }): Promise<Category> {
  const result = await apiRequest<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new Error('Failed to create category');
  return result;
}

export async function updateCategory(id: number, data: { name: string; color?: string; description?: string }): Promise<Category> {
  const result = await apiRequest<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!result) throw new Error('Failed to update category');
  return result;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiRequest(`/categories/${id}`, { method: 'DELETE' });
}

// Tags API
export interface Tag {
  id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export async function getTags(): Promise<Tag[]> {
  const result = await apiRequest<Tag[]>('/tags');
  return result ?? [];
}

export async function createTag(data: { name: string; color?: string; description?: string }): Promise<Tag> {
  const result = await apiRequest<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!result) throw new Error('Failed to create tag');
  return result;
}

export async function updateTag(id: number, data: { name: string; color?: string; description?: string }): Promise<Tag> {
  const result = await apiRequest<Tag>(`/tags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!result) throw new Error('Failed to update tag');
  return result;
}

export async function deleteTag(id: number): Promise<void> {
  await apiRequest(`/tags/${id}`, { method: 'DELETE' });
}

// Document Category/Tag Management
export interface DocumentCategory extends Category {
  assigned_at: string;
}

export interface DocumentTag extends Tag {
  assigned_at: string;
}

export async function getDocumentCategories(documentId: number): Promise<DocumentCategory[]> {
  const result = await apiRequest<DocumentCategory[]>(`/documents/${documentId}/categories`);
  return result ?? [];
}

export async function addDocumentCategory(documentId: number, categoryId: number): Promise<void> {
  await apiRequest(`/documents/${documentId}/categories`, {
    method: 'POST',
    body: JSON.stringify({ categoryId }),
  });
}

export async function removeDocumentCategory(documentId: number, categoryId: number): Promise<void> {
  await apiRequest(`/documents/${documentId}/categories/${categoryId}`, { method: 'DELETE' });
}

export async function getDocumentTags(documentId: number): Promise<DocumentTag[]> {
  const result = await apiRequest<DocumentTag[]>(`/documents/${documentId}/tags`);
  return result ?? [];
}

export async function addDocumentTag(documentId: number, tagId: number): Promise<void> {
  await apiRequest(`/documents/${documentId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
}

export async function removeDocumentTag(documentId: number, tagId: number): Promise<void> {
  await apiRequest(`/documents/${documentId}/tags/${tagId}`, { method: 'DELETE' });
}
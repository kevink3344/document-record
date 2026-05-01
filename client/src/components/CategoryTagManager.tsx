import { useEffect, useState } from 'react';
import {
  getCategories,
  getTags,
  createCategory,
  createTag,
  updateCategory,
  updateTag,
  deleteCategory,
  deleteTag,
  getDocumentCategories,
  getDocumentTags,
  addDocumentCategory,
  addDocumentTag,
  removeDocumentCategory,
  removeDocumentTag,
  type Category,
  type Tag,
  type DocumentCategory,
  type DocumentTag,
} from '../lib/api';

interface CategoryTagManagerProps {
  documentId?: number;
  onChange?: () => void;
}

export function CategoryTagManager({ documentId, onChange }: CategoryTagManagerProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategory[]>([]);
  const [documentTags, setDocumentTags] = useState<DocumentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({ name: '', color: '#3B82F6', description: '' });

  useEffect(() => {
    loadData();
  }, [documentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [categoriesData, tagsData] = await Promise.all([getCategories(), getTags()]);
      setCategories(categoriesData);
      setTags(tagsData);

      if (documentId) {
        const [docCategories, docTags] = await Promise.all([
          getDocumentCategories(documentId),
          getDocumentTags(documentId),
        ]);
        setDocumentCategories(docCategories);
        setDocumentTags(docTags);
      }
    } catch (error) {
      console.error('Failed to load categories/tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!formData.name.trim()) return;
    try {
      await createCategory(formData);
      setFormData({ name: '', color: '#3B82F6', description: '' });
      setShowCategoryForm(false);
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!formData.name.trim()) return;
    try {
      await createTag(formData);
      setFormData({ name: '', color: '#10B981', description: '' });
      setShowTagForm(false);
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !formData.name.trim()) return;
    try {
      await updateCategory(editingCategory.id, formData);
      setEditingCategory(null);
      setFormData({ name: '', color: '#3B82F6', description: '' });
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !formData.name.trim()) return;
    try {
      await updateTag(editingTag.id, formData);
      setEditingTag(null);
      setFormData({ name: '', color: '#10B981', description: '' });
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to update tag:', error);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteCategory(id);
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const handleDeleteTag = async (id: number) => {
    if (!confirm('Are you sure you want to delete this tag?')) return;
    try {
      await deleteTag(id);
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to delete tag:', error);
    }
  };

  const handleToggleDocumentCategory = async (categoryId: number) => {
    if (!documentId) return;
    const isAssigned = documentCategories.some((dc) => dc.id === categoryId);

    try {
      if (isAssigned) {
        await removeDocumentCategory(documentId, categoryId);
      } else {
        await addDocumentCategory(documentId, categoryId);
      }
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to toggle document category:', error);
    }
  };

  const handleToggleDocumentTag = async (tagId: number) => {
    if (!documentId) return;
    const isAssigned = documentTags.some((dt) => dt.id === tagId);

    try {
      if (isAssigned) {
        await removeDocumentTag(documentId, tagId);
      } else {
        await addDocumentTag(documentId, tagId);
      }
      await loadData();
      onChange?.();
    } catch (error) {
      console.error('Failed to toggle document tag:', error);
    }
  };

  const startEditCategory = (category: Category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, color: category.color, description: category.description });
  };

  const startEditTag = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({ name: tag.name, color: tag.color, description: tag.description });
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setEditingTag(null);
    setFormData({ name: '', color: '#3B82F6', description: '' });
  };

  if (loading) {
    return <div className="text-center py-4">Loading categories and tags...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Categories Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Categories</h3>
          <button
            onClick={() => setShowCategoryForm(true)}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Add Category
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border cursor-pointer transition-colors ${
                documentCategories.some((dc) => dc.id === category.id)
                  ? 'bg-opacity-20 border-opacity-50'
                  : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
              }`}
              style={{
                backgroundColor: documentCategories.some((dc) => dc.id === category.id)
                  ? `${category.color}20`
                  : undefined,
                borderColor: documentCategories.some((dc) => dc.id === category.id)
                  ? category.color
                  : undefined,
                color: documentCategories.some((dc) => dc.id === category.id)
                  ? category.color
                  : undefined,
              }}
              onClick={() => documentId && handleToggleDocumentCategory(category.id)}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span>{category.name}</span>
              {!documentId && (
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditCategory(category);
                    }}
                    className="text-xs hover:text-blue-600"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(category.id);
                    }}
                    className="text-xs hover:text-red-600"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tags Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Tags</h3>
          <button
            onClick={() => setShowTagForm(true)}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            Add Tag
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <div
              key={tag.id}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border cursor-pointer transition-colors ${
                documentTags.some((dt) => dt.id === tag.id)
                  ? 'bg-opacity-20 border-opacity-50'
                  : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
              }`}
              style={{
                backgroundColor: documentTags.some((dt) => dt.id === tag.id)
                  ? `${tag.color}20`
                  : undefined,
                borderColor: documentTags.some((dt) => dt.id === tag.id)
                  ? tag.color
                  : undefined,
                color: documentTags.some((dt) => dt.id === tag.id)
                  ? tag.color
                  : undefined,
              }}
              onClick={() => documentId && handleToggleDocumentTag(tag.id)}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span>{tag.name}</span>
              {!documentId && (
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditTag(tag);
                    }}
                    className="text-xs hover:text-blue-600"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTag(tag.id);
                    }}
                    className="text-xs hover:text-red-600"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Form Modal */}
      {(showCategoryForm || showTagForm || editingCategory || editingTag) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingCategory ? 'Edit Category' : editingTag ? 'Edit Tag' : showCategoryForm ? 'Create Category' : 'Create Tag'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter description (optional)"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={editingCategory ? handleUpdateCategory : editingTag ? handleUpdateTag : showCategoryForm ? handleCreateCategory : handleCreateTag}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                {editingCategory || editingTag ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCategoryForm(false);
                  setShowTagForm(false);
                  cancelEdit();
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
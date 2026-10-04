// postActionRegistry.ts

export type PostActionType = "edit" | "delete" | "share" | "report";

export type PostItemType =
  | "post"
  | "reel"
  | "group_post"
  | "event"
  | "product";

export interface PostActionPayload {
  id: string | number;
  content?: string;
  caption?: string;
  groupId?: string | number;
  [key: string]: any; // Allow any additional properties
}

export type ActionHandler = (payload: PostActionPayload) => Promise<any> | void;

export type ActionMap = {
  [type in PostItemType]?: {
    [action in PostActionType]?: ActionHandler;
  };
};

// Registry to store action handlers
const registry: ActionMap = {};

/**
 * Register action handlers for a specific post type
 * This should be called once from App.tsx during initialization
 */
export const registerPostActions = (
  type: PostItemType,
  actions: Partial<Record<PostActionType, ActionHandler>>
): void => {
  console.log(`📝 Registering actions for ${type}:`, Object.keys(actions));
  registry[type] = {
    ...(registry[type] || {}),
    ...actions,
  };
};

/**
 * Perform a post action (edit/delete/share/report) for any post type
 * This is the main function UI components should use
 */
export const performPostAction = async (
  type: PostItemType,
  action: PostActionType,
  payload: PostActionPayload
): Promise<any> => {
  console.log(`🎯 Performing ${action} on ${type}:`, payload);
  
  const handler = registry[type]?.[action];

  if (!handler) {
    console.warn(`⚠️ No handler registered for ${type}:${action}`);
    throw new Error(`Action ${action} not supported for ${type}`);
  }

  try {
    const result = await handler(payload);
    console.log(`✅ ${action} successful for ${type}:`, result);
    return result;
  } catch (error) {
    console.error(`❌ ${action} failed for ${type}:`, error);
    throw error;
  }
};

/**
 * Check if an action is supported for a post type
 * Useful for conditionally rendering action buttons
 */
export const isActionSupported = (
  type: PostItemType,
  action: PostActionType
): boolean => {
  return !!registry[type]?.[action];
};

/**
 * Get all registered post types
 */
export const getRegisteredPostTypes = (): PostItemType[] => {
  return Object.keys(registry) as PostItemType[];
};

/**
 * Get all supported actions for a specific post type
 */
export const getSupportedActions = (
  type: PostItemType
): PostActionType[] => {
  const actions = registry[type];
  if (!actions) return [];
  return Object.keys(actions) as PostActionType[];
};

/**
 * Clear all registered actions (useful for testing)
 */
export const clearRegistry = (): void => {
  Object.keys(registry).forEach(key => {
    delete registry[key as PostItemType];
  });
};

/**
 * Check if a post type has any registered actions
 */
export const hasRegisteredActions = (type: PostItemType): boolean => {
  const actions = registry[type];
  return !!actions && Object.keys(actions).length > 0;
};

// Default export for convenience
export default {
  registerPostActions,
  performPostAction,
  isActionSupported,
  getRegisteredPostTypes,
  getSupportedActions,
  clearRegistry,
  hasRegisteredActions,
};

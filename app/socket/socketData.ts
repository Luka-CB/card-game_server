interface User {
  id: string;
  username: string;
}

const onlineUsers = new Map<string, User>();

export { onlineUsers };

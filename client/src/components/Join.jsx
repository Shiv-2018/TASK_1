export default function Join({ username, setUsername, room, setRoom, joinRoom }) {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-2xl shadow-md w-80 flex flex-col gap-4">
        
        <h1 className="text-xl font-bold text-center">Join Chat Room</h1>

        <input
          className="border p-2 rounded"
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="border p-2 rounded"
          placeholder="Room ID"
          onChange={(e) => setRoom(e.target.value)}
        />

        <button
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 rounded"
          onClick={joinRoom}
        >
          Join
        </button>
      </div>
    </div>
  );
}
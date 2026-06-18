import Sidebar from "./Sidebar/Sidebar";
import Header from "./Header/Header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-[#f5f7fb] p-6">{children}</main>
      </div>
    </div>
  );
}

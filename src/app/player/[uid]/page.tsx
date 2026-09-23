import type { Metadata } from "next";
import { PlayerPage } from "@/components/player/PlayerPage";

export const metadata: Metadata = {
  title: "播放",
  description: "Saidao 直播播放页",
};

export default async function PlayerRoute({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <PlayerPage uid={uid} />;
}

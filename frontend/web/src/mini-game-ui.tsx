import { MiniGameScreen } from '@picklehub/mini-game';
import '@picklehub/mini-game/styles.css';
import type { IdentityClient } from '@picklehub/api-client';
import { useNavigate } from 'react-router-dom';

export function MiniGameRoute({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const navigate = useNavigate();
    return <MiniGameScreen channel="web" client={client} online={online} onClose={() => navigate('/')} />;
}

/* ============================================================
   VINCULAR WALLET — columna real: wallet_address
============================================================ */

async vincularWallet(
    walletAddress
) {

    try {

        if (!this.usuario) {
            return false;
        }

        const {
            error
        } =
            await this.supabase
                .from('usuarios')
                .update({
                    wallet_address:
                        walletAddress
                })
                .eq(
                    'id',
                    this.usuario.id
                );

        if (error) {
            throw error;
        }

        return true;

    } catch (error) {

        console.error(
            'Error vinculando wallet:',
            error
        );

        return false;
    }
}
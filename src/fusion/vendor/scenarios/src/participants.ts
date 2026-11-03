// Ces comptes représentent des utilisateurs qui paient ; ce ne sont pas des machines du réseau.
// Leurs soldes n'ont aucun lien avec les mises des validateurs.
export type { PaymentAccount as DemoAccount } from '../../contracts/src/index.js';
export const demoAccounts = [
    { id: 'david', name: 'David', initialBalance: 1000 }, // Émetteur du paiement de démonstration.
    { id: 'sarah', name: 'Sarah', initialBalance: 0 }, // Destinataire des 10 unités.
    { id: 'lea', name: 'Léa', initialBalance: 0 }, // Autre destinataire pour les dépenses concurrentes.
] as const;
// Le nonce numérote les paiements d'un compte : son premier paiement utilise le numéro 0.
export const demoPayment = { from: 'david', to: 'sarah', amount: 10, nonce: 0 } as const;

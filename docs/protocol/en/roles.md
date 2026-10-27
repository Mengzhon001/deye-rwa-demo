# Roles, wallets and permissions

Wallet addresses determine roles. Selecting a role requests access; it does not grant authority. The sign-in message binds the domain, address, chain ID, nonce, expiration and requested role. The backend verifies the signature and configured address before creating a session.

## Four participants

| Role | Responsibilities | Boundary |
| --- | --- | --- |
| Household | Apply, supplement information, accept offers, sign agreements, authorize NFT custody and pay monthly USDC electricity bills from their own wallet. | Cannot approve valuations, publish products or issue shares. |
| Intermediary | Assess applications, prepare offers and valuations, mint credentials, admit rights and operate the product. | Cannot replace household authorization or trustee valuation approval. |
| Investor | Apply for eligibility, subscribe or refund, claim distributions, transfer, request redemption and support servicing cases. | Eligibility requires intermediary approval onchain; ordinary wallets have no management authority. |
| Trustee | Review offers, approve pool valuations and approve servicing remedies. | Separate from the intermediary; a collection-recipient change requires two distinct trustee approvals. |

## Sign-in order

Click Launch App, choose a role, then connect and sign in. The wallet connects and switches to the demo network before signing a login message. Login does not move assets. Each later onchain action requires its own transaction approval.

Households, intermediaries and trustees must use configured wallets. Either trustee can use the trustee entry; their identities remain separate. An ordinary unassigned wallet enters as an investor, without automatic investment eligibility.

For an address mismatch, the dialog shows configured addresses and an account-switch action. Declining or cancelling does not advance the business workflow. Account changes, network changes, disconnections and expiration require a new login.

## System accounts

Deployment, faucet and simulated-receipt accounts provide local infrastructure. They do not sign business actions for the household, intermediary or trustees. The backend does not store real users' private keys. Automated tests use separate local wallets whose keys never enter the website or source package.

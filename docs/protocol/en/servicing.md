# Servicing cases and trustee remedies

Ordinary generation underperformance or forecast error does not automatically constitute household default. Servicing cases address missing remittances, diverted receipts, breached obligations or prolonged operating incidents requiring investigation.

## Initiation and evidence

The intermediary opens a case with an evidence hash and proposed demo collection recipient. Economic holdings are fixed in a snapshot when the case opens. Later transfers cannot increase or move that case's voting weight, and each snapshot holder can support the case only as permitted by the contract.

## Threshold and two approvals

Support must reach 30% of snapshot weight. Two distinct trustee addresses must then approve. The intermediary cannot self-review as a trustee, and one trustee cannot count twice.

Execution changes a demo recipient record in the contract and produces an event and receipt. It does not control physical inverters, change actual grid-payment or bank accounts, or replace enforcement of an offchain agreement.

## What to inspect

Review the snapshot total, support weight, each trustee's approval and the final transaction. Chain confirmation and Blockscout indexing are displayed separately; an indexing delay does not mean execution failed.

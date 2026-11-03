// Une entrée possède une date virtuelle et un numéro unique d'insertion.
interface Scheduled {
    atMs: number;
    seq: number;
}

// File de priorité : garde le prochain événement en tête sans retrier toute la file à chaque pas.
// Cela devient important lorsque douze nœuds émettent et retransmettent beaucoup de messages.
export class EventQueue<T extends Scheduled> {
    private items: T[] = [];

    get length(): number {
        return this.items.length;
    }

    // Compare d'abord les dates ; à date égale, respecte exactement l'ordre d'insertion du moteur.
    private before(a: T, b: T): boolean {
        return a.atMs < b.atMs || (a.atMs === b.atMs && a.seq < b.seq);
    }

    // Consulter la prochaine entrée ne la retire pas et ne fait pas avancer le temps.
    peek(): T | undefined {
        return this.items[0];
    }

    push(event: T): void {
        // Ajoute au fond puis remonte l'entrée tant qu'elle doit passer avant son parent.
        this.items.push(event);
        let index = this.items.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (!this.before(this.items[index], this.items[parent])) break;
            [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
            index = parent;
        }
    }

    shift(): T | undefined {
        // L'entrée minimale est toujours à l'indice 0 ; le dernier élément comble sa place.
        const first = this.items[0];
        const last = this.items.pop();
        if (!this.items.length) return first;
        this.items[0] = last!;
        let index = 0;
        for (;;) {
            // Descend vers l'enfant prioritaire jusqu'à retrouver l'ordre de la file.
            const left = 2 * index + 1;
            const right = left + 1;
            let best = index;
            if (left < this.items.length && this.before(this.items[left], this.items[best])) best = left;
            if (right < this.items.length && this.before(this.items[right], this.items[best])) best = right;
            if (best === index) break;
            [this.items[index], this.items[best]] = [this.items[best], this.items[index]];
            index = best;
        }
        return first;
    }

    clear(): void {
        // Fermer une expérience supprime ses actions futures, sans prétendre qu'elles ont été livrées.
        this.items = [];
    }
}
